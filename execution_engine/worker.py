import subprocess
import tempfile
import os
from celery import Celery

# Connect using strict IPv4 
celery_app = Celery(
    'tasks',
    broker='redis://127.0.0.1:6379/0',
    backend='redis://127.0.0.1:6379/0'
)

# Explicitly force Celery to write results and not ignore them
celery_app.conf.update(
    result_backend='redis://127.0.0.1:6379/0',
    task_ignore_result=False,
    result_expires=3600
)

# ---> NEW: Added `stdin` parameter (defaults to empty string)
@celery_app.task(name="worker.execute_code_task")
def execute_code_task(language: str, code: str, stdin: str = ""):
    language = language.lower()

    # ---> NEW: Create a temporary directory to hold the code file
    # This prevents the "stdin" collision so Docker knows the difference between the script and the input.
    with tempfile.TemporaryDirectory() as temp_dir:
        
        if language == "python":
            file_path = os.path.join(temp_dir, "main.py")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
            
            # Mount the temp folder into Docker (-v) and run the file
            cmd = [
                "docker", "run", "--rm", "-i", 
                "-v", f"{temp_dir}:/app", "-w", "/app", 
                "python:3.9-slim", "python", "main.py"
            ]
            
        elif language in ["c++", "cpp"]:
            file_path = os.path.join(temp_dir, "main.cpp")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)
                
            # Mount the temp folder, compile the file, and run it
            cmd = [
                "docker", "run", "--rm", "-i",
                "-v", f"{temp_dir}:/app", "-w", "/app",
                "gcc:latest", "sh", "-c", "g++ -O2 main.cpp -o main && ./main"
            ]
        else:
            return {"error": f"Language '{language}' is not supported."}

        try:
            # ---> NEW: We now pass the USER'S text input into the container
            result = subprocess.run(
                cmd,
                input=stdin.encode('utf-8'), 
                capture_output=True,
                timeout=10
            )

            if result.returncode != 0:
                return {"error": result.stderr.decode('utf-8') or "Unknown execution error."}

            return {"output": result.stdout.decode('utf-8')}

        except subprocess.TimeoutExpired:
            return {"error": "❌ Execution timed out (Limit: 10s)."}
        except Exception as e:
            return {"error": f"❌ Server Error: {str(e)}"}