import sys
import os
from gemini_api import GeminiClient

# Mock response from the user's Vercel failure
MOCK_RAW_RESPONSE = """)]}'\n\n39\n[[\"wrb.fr\",null,null,null,null,[13]]]\n57\n[[\"di\",3121],[\"af.httprm\",3120,\"877034268532787964\",2]]\n25\n[[\"e\",4,null,null,133]]\n"""

def test_parser():
    client = GeminiClient("psid", "psidts")
    print("[*] Testing parser with mock Vercel error response...")
    result = client._parse_response(MOCK_RAW_RESPONSE)
    
    if "error" in result:
        print(f"[+] Success! Parser detected error: {result['error']}")
        if "Google Backend Error" in result['error'] or "Google Session Rejected" in result['error']:
            print("[+] Verified: The error message is descriptive and helpful.")
        else:
            print(f"[-] Warning: The error message might not be descriptive enough: {result['error']}")
    else:
        print("[-] Failure: Parser failed to detect error in mock response.")
        print(result)

if __name__ == "__main__":
    test_parser()
