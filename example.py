import os
from gemini_api import GeminiClient

def main():
    print("--- Gemini Reverse API Demo ---")
    
    # You must provide your own __Secure-1PSID and __Secure-1PSIDTS cookies
    # extracted from gemini.google.com in your browser.
    
    psid = input("Enter your __Secure-1PSID: ").strip()
    psidts = input("Enter your __Secure-1PSIDTS: ").strip()
    
    if not psid or not psidts:
        print("Cookies are required to proceed.")
        return

    try:
        client = GeminiClient(psid, psidts)
        print("\n[+] Initializing session and fetching security token...")
        
        while True:
            prompt = input("\nYou: ").strip()
            if prompt.lower() in ["exit", "quit", "bye"]:
                break
            
            print("[*] Gemini is thinking...")
            response = client.ask(prompt)
            
            if "error" in response:
                print(f"[-] Error: {response['error']}")
                if "raw" in response:
                    print(f"Detailed error: {response['raw'][:200]}...")
            else:
                print(f"Gemini: {response['content']}")
                print(f"(Conv ID: {response['conversation_id']})")
                
    except Exception as e:
        print(f"[-] An error occurred: {str(e)}")

if __name__ == "__main__":
    main()
