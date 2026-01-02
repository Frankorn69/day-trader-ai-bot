import os
import sys

def check_security():
    print("🔒 Running Pre-Commit Security Check...")
    
    # 1. Check for .env file in staging (simulated check for now)
    if os.path.exists(".env"):
        print("❌ CRITICAL: '.env' file detected in directory!")
        print("   Ensure it is in .gitignore and NOT added to git.")
        # In a real hook we would check 'git diff --cached --name-only'
    
    # 2. Scan for keywords in tracked files (simplified)
    suspicious_keywords = ["api_key", "secret_key", "private_key", "password"]
    
    extensions = ['.js', '.html', '.py']
    
    found_issues = False
    
    for root, dirs, files in os.walk("."):
        if ".git" in dirs:
            dirs.remove(".git")
        
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                filepath = os.path.join(root, file)
                # Skip the security check script itself
                if "security_check.py" in filepath:
                    continue
                    
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        for i, line in enumerate(f):
                            for kw in suspicious_keywords:
                                if kw in line.lower() and "=" in line and "process.env" not in line and "getenv" not in line and "document.getelementbyid" not in line:
                                    # Basic heuristic to avoid alerting on code that READS secrets
                                    # We worry about hardcoded strings like: const api_key = "abc";
                                    if '"' in line or "'" in line:
                                        print(f"⚠️  WARNING: Potential secret in {file}:{i+1}")
                                        print(f"   Line: {line.strip()[:60]}...")
                                        found_issues = True
                except:
                    pass

    if found_issues:
        print("\n⚠️  Security Audit found potential issues. Review above.")
        print("   If these are false positives (e.g. reading from UI), you can proceed.")
    else:
        print("✅ Codebase looks clean. No obvious hardcoded secrets found.")

if __name__ == "__main__":
    check_security()
