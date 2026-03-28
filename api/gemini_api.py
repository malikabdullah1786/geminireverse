import requests
import json
import re
import random
from bs4 import BeautifulSoup

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
        
        self.at_token = None
        self.conversation_id = ""
        self.response_id = ""
        self.choice_id = ""
        self.req_id = random.randint(1000, 9999)

    def _get_at_token(self):
        """
        Internal method to fetch the 'at' (SNlM0e) token from the Gemini application page.
        This token is required for all POST requests to the API.
        """
        response = self.session.get(f"{self.BASE_URL}/app", timeout=10)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch Gemini page. Status code: {response.status_code}")
        
        # Extract the SNlM0e token using regex
        match = re.search(r'SNlM0e":"(.*?)"', response.text)
        if match:
            self.at_token = match.group(1)
        else:
            raise Exception("Could not find SNlM0e token. Your cookies might be expired or invalid.")

    def ask(self, prompt):
        """
        Send a prompt to Gemini and return the response.
        :param prompt: The text message to send.
        :return: A dictionary containing the text response and metadata.
        """
        if not self.at_token:
            self._get_at_token()

        url_params = {
            "bl": "boq_assistant-bard-web-server_20240319.10_p0",
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
            chunks = re.split(r'\d+\n', clean_text)
            
            result = {"content": "", "images": [], "conversation_id": self.conversation_id}

            for chunk in chunks:
                if not chunk.strip():
                    continue
                
                try:
                    data = json.loads(chunk)
                    find_images(data) # Collect all images from the chunk
                    
                    # Case 1: The "wrb.fr" wrapper
                    for item in data:
                        if isinstance(item, list) and len(item) > 2 and item[0] == "wrb.fr":
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
            
            if not result["content"] and not result["images"]:
                print(f"DEBUG: Could not parse response. Raw text snippet: {raw_text[:500]}")
                return {"error": "Could not parse response text", "raw": raw_text}
            
            return result
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"DEBUG: Parsing exception: {str(e)}")
            return {"error": f"Parsing exception: {str(e)}", "raw": raw_text}

if __name__ == "__main__":
    print("GeminiClient library loaded. Use GeminiClient(psid, psidts) to interact.")
