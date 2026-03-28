import requests # type: ignore
import json
import re
import random
from typing import Optional, Dict, Any, List
from bs4 import BeautifulSoup # type: ignore

class GeminiClient:
    """
    A reverse-engineered Gemini API client for Python.
    Uses session cookies for authentication.
    """
    
    BASE_URL = "https://gemini.google.com"
    API_URL = f"{BASE_URL}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
    
    def __init__(self, psid, psidts):
        """
        Initialize the client with required cookies.
        :param psid: __Secure-1PSID cookie value
        :param psidts: __Secure-1PSIDTS cookie value
        """
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "Host": "gemini.google.com",
            "Origin": "https://gemini.google.com",
            "Referer": "https://gemini.google.com/",
            "X-Same-Domain": "1",
        })
        
        # Set essential cookies
        self.session.cookies.set("__Secure-1PSID", psid, domain=".google.com")
        self.session.cookies.set("__Secure-1PSIDTS", psidts, domain=".google.com")
        
        self.at_token: Optional[str] = None
        self.bl_label: Optional[str] = "boq_assistant-bard-web-server_20240319.10_p0" # Fallback
        self.conversation_id: str = ""
        self.response_id: str = ""
        self.choice_id: str = ""
        self.req_id: int = random.randint(100000, 999999)

    def _get_at_token(self):
        """
        Internal method to fetch the 'at' (SNlM0e) token and current build label (bl) from the Gemini application page.
        """
        response = self.session.get(f"{self.BASE_URL}/app", timeout=10)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch Gemini page. Status code: {response.status_code}")
        
        # Extract the SNlM0e token
        match_at = re.search(r'SNlM0e":"(.*?)"', response.text)
        if match_at:
            self.at_token = match_at.group(1) # type: ignore
        else:
            raise Exception("Could not find SNlM0e token. Your cookies might be expired or invalid.")

        # Extract the build label (bl)
        match_bl = re.search(r'"cfb2h":"(.*?)"', response.text)
        if match_bl:
            self.bl_label = match_bl.group(1)
            print(f"[*] DEBUG: Dynamic Build Label extracted: {self.bl_label}")

    def ask(self, prompt, is_retry=False):
        """
        Send a prompt to Gemini and return the response.
        :param prompt: The text message to send.
        :param is_retry: Internally used to prevent infinite recursion on at_token refresh.
        :return: A dictionary containing the text response and metadata.
        """
        if not self.at_token:
            self._get_at_token()

        # Increment req_id to simulate browser flow
        self.req_id += random.randint(1000, 5000)

        url_params = {
            "bl": self.bl_label,
            "_reqid": str(self.req_id),
            "rt": "c"
        }

        # Optimized request structure for advanced features (Image Generation, etc.)
        request_data = [
            [prompt, 0, None, None, None, None, 0],
            None,
            [self.conversation_id, self.response_id, self.choice_id]
        ]
        
        payload = {
            "f.req": json.dumps([None, json.dumps(request_data)]),
            "at": self.at_token
        }

        try:
            response = self.session.post(
                self.API_URL, 
                params=url_params, 
                data=payload, 
                timeout=60
            )

            # Handle session expiration/mismatch and retry once
            if response.status_code in [401, 403] and not is_retry:
                print("[*] WARNING: Session potentially expired. Refreshing at_token...")
                self._get_at_token()
                return self.ask(prompt, is_retry=True)

            if response.status_code != 200:
                return {"error": f"Request failed with status {response.status_code}", "raw": response.text}

            return self._parse_response(response.text)
        except requests.exceptions.Timeout:
            return {"error": "Connection to Gemini timed out. Please try again later."}
        except Exception as e:
            return {"error": f"Connection error: {str(e)}"}

    def _parse_response(self, raw_text):
        """
        Parses the complex, chunked response from Gemini's internal API.
        Extracts the main text response, images, and updates conversation context.
        """
        images = []
        
        def find_images(obj):
            """Recursively find image URLs in the object."""
            # Valid image hosting subdomains/domains
            valid_patterns = [
                "lh3.googleusercontent.com",
                "lh4.googleusercontent.com",
                "lh5.googleusercontent.com",
                "lh6.googleusercontent.com",
                "www.gstatic.com",
                "encrypted-tbn0.gstatic.com",
                "googleusercontent.com/drawings"
            ]
            
            # Internal placeholders to EXCLUDE
            ignore_patterns = [
                "image_generation_content",
                "/search",
                "/imgres"
            ]

            if isinstance(obj, str):
                # 1. Basic format check
                if not (obj.startswith("http") or obj.startswith("//")):
                    return

                # 2. Protocol normalization
                full_url = obj if obj.startswith("http") else f"https:{obj}"

                # 3. Validation
                is_valid = any(p in full_url for p in valid_patterns)
                is_ignored = any(p in full_url for p in ignore_patterns)

                if is_valid and not is_ignored:
                    if full_url not in images:
                        images.append(full_url)
            elif isinstance(obj, list):
                for item in obj:
                    find_images(item)
            elif isinstance(obj, dict):
                for value in obj.values():
                    find_images(value)

        try:
            # Strip the garbage prefix if present
            clean_text = raw_text.lstrip(")]}'\n ")
            
            # Gemini typically returns multiple chunks.
            chunks = re.split(r'\d+\r?\n', clean_text)
            
            result = {"content": "", "images": [], "conversation_id": self.conversation_id}
            pending_error = None

            for chunk in chunks:
                if not chunk.strip():
                    continue
                
                try:
                    data = json.loads(chunk)
                    find_images(data) # Collect all images from the chunk
                    
                    # Detect Google Internal Errors (Session Expired/IP Blocked)
                    # Pattern: ["e", 4, null, null, 133] or ["wrb.fr", null, null, null, null, [13]]
                    for item in data:
                        if isinstance(item, list) and len(item) > 0:
                            if item[0] == "e":
                                error_code = item[-1] if len(item) > 4 else "unknown"
                                pending_error = {"error": f"Google Backend Error ({error_code}). This usually means the session is expired or the IP is blocked (common on Vercel).", "raw": raw_text}
                            
                            if item[0] == "wrb.fr" and (len(item) < 3 or item[2] is None):
                                error_meta = item[-1] if len(item) > 5 else "unknown"
                                pending_error = {"error": f"Google Session Rejected (Code {error_meta}). Your cookies might be invalid or Vercel's IP is blocked.", "raw": raw_text}

                    # Case 1: The "wrb.fr" wrapper with valid data
                    for item in data:
                        if isinstance(item, list) and len(item) > 2 and item[0] == "wrb.fr" and item[2] is not None:
                            inner_data = json.loads(item[2])
                            find_images(inner_data)
                            
                            if len(inner_data) > 1 and isinstance(inner_data[1], list):
                                self.conversation_id = inner_data[1][0]
                                self.response_id = inner_data[1][1]
                            
                            if len(inner_data) > 4 and isinstance(inner_data[4], list):
                                choices = inner_data[4]
                                if len(choices) > 0 and len(choices[0]) > 1:
                                    self.choice_id = choices[0][0]
                                    result["content"] = choices[0][1][0]
                                    result["conversation_id"] = self.conversation_id
                                    result["response_id"] = self.response_id
                                    result["choice_id"] = self.choice_id

                    # Case 2: The "w69eS" identifier
                    for item in data:
                        if isinstance(item, list) and len(item) > 0 and item[0] == "w69eS":
                            result["content"] = item[1]
                            metadata = item[2]
                            self.conversation_id = metadata[0]
                            self.response_id = metadata[1]
                            self.choice_id = metadata[2][0][0]
                            
                            result["conversation_id"] = self.conversation_id
                            result["response_id"] = self.response_id
                            result["choice_id"] = self.choice_id
                except (json.JSONDecodeError, IndexError, TypeError):
                    continue
            
            # Remove duplicate images
            result["images"] = list(dict.fromkeys(images))
            
            # Priority 1: Content found - RETURN SUCCESS (ignore pending errors like 2601)
            if result["content"] or result["images"]:
                return result
            
            # Priority 2: No content but has a pending error - RETURN ERROR
            if pending_error:
                return pending_error
            
            # Priority 3: No content, no images, no explicit error chunk
            # Explicit check for the known 'null' error pattern in raw text
            if "wrb.fr" in str(raw_text) and ("null" in str(raw_text) or "Error" in str(raw_text)): # type: ignore
                return {"error": "Google returned an empty response. This often happens on Vercel due to IP-based session invalidation.", "raw": raw_text}
            
            return {"error": "Could not parse response content. Google might have changed the format.", "raw": raw_text}
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"DEBUG: Parsing exception: {str(e)}")
            return {"error": f"Parsing exception: {str(e)}", "raw": raw_text}

if __name__ == "__main__":
    print("GeminiClient library loaded. Use GeminiClient(psid, psidts) to interact.")
