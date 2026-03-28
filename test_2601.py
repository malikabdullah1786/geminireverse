from gemini_api import GeminiClient
import json
import os

def test():
    client = GeminiClient("psid", "psidts")
    print("[*] Testing parser with user's 'error 2601' response recorded in mock_response.json...")
    
    if not os.path.exists("mock_response.json"):
        print("[-] Error: mock_response.json not found.")
        return

    with open("mock_response.json", "r") as f:
        data = json.load(f)
    
    raw_response = data["raw"]
    result = client._parse_response(raw_response)
    
    if "error" in result:
        print(f"[-] FAILED: Parser still returned error: {result['error']}")
    else:
        print("[+] SUCCESS: Parser ignored non-fatal error 2601 because content was found!")
        content = result.get('content', '')
        print(f"[+] Content found: {content[:100]}...")
        if "Hello! How can I help you" in content:
             print("[+] VERIFIED: The specific content from the mock was correctly extracted.")

if __name__ == "__main__":
    test()
