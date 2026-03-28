from fastapi import FastAPI, HTTPException, Request, Depends, Header # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from pydantic import BaseModel # type: ignore
from gemini_api import GeminiClient
import requests # type: ignore
import os
import uuid
import json
from typing import Any, Dict, Optional, List # type: ignore

app = FastAPI()

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SESSION_FILE = os.path.join(SCRIPT_DIR, "api", "session.json")

# Global state (Multi-Tenant)
CLIENTS: Dict[str, GeminiClient] = {}      # user_id -> GeminiClient
API_KEYS: Dict[str, str] = {}     # api_key -> user_id
USER_CONFIGS: Dict[str, Dict[str, Any]] = {} # user_id -> {"api_key": ..., "psid": ..., "psidts": ...}

def save_all_sessions():
    """Persists all user sessions to a local JSON file (pretty-printed)."""
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump(USER_CONFIGS, f, indent=4)
        print(f"[*] DEBUG: Saved {len(USER_CONFIGS)} sessions to {SESSION_FILE}")
    except Exception as e:
        print(f"[*] ERROR: Failed to save sessions: {e}")

def load_all_sessions():
    """Restores all user sessions from JSON on startup."""
    global CLIENTS, API_KEYS, USER_CONFIGS
    if os.path.exists(SESSION_FILE):
        try:
            with open(SESSION_FILE, "r") as f:
                content = f.read().strip()
                if not content:
                    return # Silent return for empty file
                data = json.loads(content)
                
                if isinstance(data, dict):
                    # Check for legacy single-user format
                    if "psid" in data and "psidts" in data:
                        uid = "legacy_user"
                        USER_CONFIGS.clear()
                        USER_CONFIGS[uid] = data
                    else:
                        USER_CONFIGS.clear()
                        USER_CONFIGS.update(data)
                else:
                    print(f"[*] WARNING: Invalid session data format in {SESSION_FILE} (expected dict).")
                    USER_CONFIGS.clear()
                
                for uid, config in USER_CONFIGS.items():
                    try:
                        CLIENTS[uid] = GeminiClient(config["psid"], config["psidts"])
                        api_key = config.get("api_key")
                        if api_key:
                            API_KEYS[api_key] = uid
                    except Exception as e:
                        print(f"[*] Failed to restore session for {uid}: {e}")
            
            save_all_sessions() # Normalize format
        except Exception as e:
            print(f"[*] Failed to restore sessions: {e}")

load_all_sessions()

class ConfigSchema(BaseModel):
    psid: str
    psidts: str
    session_name: str = None

class ChatSchema(BaseModel):
    prompt: str

# Auth dependency no longer uses single PROXY_API_KEY

@app.post("/api/config")
async def set_config(config: ConfigSchema, x_user_id: str = Header(None, alias="X-User-ID")):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="Missing X-User-ID header.")
    
    global CLIENTS, API_KEYS, USER_CONFIGS
    try:
        # Use provided session name OR existing browser ID
        final_uid = config.session_name.strip() if config.session_name else x_user_id
        # Clean the name (alphanumeric underscore only)
        final_uid = "".join(c for c in final_uid if c.isalnum() or c in ("_", "-"))
        
        # Prepare config
        existing_config = USER_CONFIGS.get(final_uid, {})
        new_key = existing_config.get("api_key", str(uuid.uuid4()))
        
        USER_CONFIGS[final_uid] = {
            "psid": config.psid,
            "psidts": config.psidts,
            "api_key": new_key
        }
        API_KEYS[new_key] = final_uid
        
        # Save IMMEDIATELY so data isn't lost if connection fails
        save_all_sessions()
        print(f"[*] DEBUG: User {final_uid} persistent storage updated.")

        # Attempt to initialize client
        try:
            client = GeminiClient(config.psid, config.psidts)
            client._get_at_token()
            CLIENTS[final_uid] = client
            connection_status = "connected"
        except Exception as conn_err:
            print(f"[*] WARNING: Persistent config saved for {final_uid}, but connection failed: {conn_err}")
            connection_status = f"saved_offline ({str(conn_err)})"

        return {
            "status": "success", 
            "connection": connection_status,
            "api_key": new_key,
            "user_id": final_uid
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/status")
async def get_status(x_user_id: str = Header(None, alias="X-User-ID")):
    return {
        "status": "online",
        "configured": x_user_id in CLIENTS
    }

@app.get("/api/key")
async def get_api_key(x_user_id: str = Header(None, alias="X-User-ID")):
    config = USER_CONFIGS.get(x_user_id, {})
    return {"api_key": config.get("api_key")}

@app.post("/api/regenerate_key")
async def regenerate_api_key(x_user_id: str = Header(None, alias="X-User-ID")):
    if x_user_id not in CLIENTS:
        raise HTTPException(status_code=400, detail="No active session for this user.")
    
    global API_KEYS, USER_CONFIGS
    # Remove old key
    old_key = USER_CONFIGS[x_user_id].get("api_key")
    if old_key in API_KEYS:
        del API_KEYS[old_key]
        
    new_key = str(uuid.uuid4())
    USER_CONFIGS[x_user_id]["api_key"] = new_key
    API_KEYS[new_key] = x_user_id
    
    save_all_sessions()
    return {"api_key": new_key}

@app.post("/api/clear_session")
async def clear_session(x_user_id: str = Header(None, alias="X-User-ID")):
    global CLIENTS, API_KEYS, USER_CONFIGS
    if x_user_id in USER_CONFIGS:
        key = USER_CONFIGS[x_user_id].get("api_key")
        if key in API_KEYS:
            del API_KEYS[key] # type: ignore
        del USER_CONFIGS[x_user_id] # type: ignore
        if x_user_id in CLIENTS:
            del CLIENTS[x_user_id] # type: ignore
        save_all_sessions()
    return {"status": "cleared"}

@app.post("/api/chat")
async def chat(request: ChatSchema, x_gemini_key: str = Header(None, alias="X-Gemini-Key"), x_user_id: str = Header(None, alias="X-User-ID")):
    global CLIENTS, API_KEYS
    
    # 1. External Key-based Auth
    if x_gemini_key:
        uid = API_KEYS.get(x_gemini_key)
        if not uid or uid not in CLIENTS:
            raise HTTPException(status_code=403, detail="Invalid Proxy API Key or Expired Session")
        client = CLIENTS[uid]
    # 2. Internal Web UI User-ID based Auth
    elif x_user_id:
        if x_user_id not in CLIENTS:
            raise HTTPException(status_code=401, detail="Gateway Unauthorized. Configure session first.")
        client = CLIENTS[x_user_id]
    else:
        raise HTTPException(status_code=401, detail="No authentication provided (X-Gemini-Key or X-User-ID)")

    try:
        response = client.ask(request.prompt)
        if "error" in response:
            return JSONResponse(status_code=500, content=response)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/proxy_image")
async def proxy_image(url: str, x_user_id: str = Header(None, alias="X-User-ID"), user_id: str = None):
    # Support both header and query param for image tag compatibility
    final_uid = x_user_id or user_id
    if not final_uid or final_uid not in CLIENTS:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Reject known invalid placeholder URLs
    if "image_generation_content" in url:
        raise HTTPException(status_code=400, detail="Invalid image placeholder URL")
    
    client = CLIENTS[final_uid]
    try:
        # For googleusercontent.com, cookies need to be explicitly passed
        # because session cookies are scoped to .google.com
        headers = {
            "Referer": "https://gemini.google.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        }
        
        # Extract cookies from the client session and send them to googleusercontent.com
        cookies = {}
        for cookie in client.session.cookies:
            cookies[cookie.name] = cookie.value
        
        resp = requests.get(url, headers=headers, cookies=cookies, stream=True, timeout=15)
        
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch image from Google (status {resp.status_code})")
            
        content_type = resp.headers.get("Content-Type", "image/png")
        
        # Safety check: only allow image content types
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="URL did not return an image")
        
        return StreamingResponse(
            resp.iter_content(chunk_size=8192),
            media_type=content_type,
            headers={"Cache-Control": "max-age=3600"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
