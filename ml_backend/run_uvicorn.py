import subprocess
import sys
import os
import time

def run():
    print("Starting uvicorn wrapper...", flush=True)
    # Start uvicorn
    cmd = [
        sys.executable,
        "-u",
        "-m",
        "uvicorn",
        "main:app",
        "--port",
        "8000",
        "--host",
        "127.0.0.1"
    ]
    
    log_file = open("uvicorn_run.log", "w", encoding="utf-8")
    
    # Run the subprocess
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1, # Line buffered
        env=os.environ
    )
    
    print(f"Uvicorn subprocess started with PID {process.pid}", flush=True)
    
    try:
        # Read output line by line and write to file
        if process.stdout is not None:
            for line in iter(process.stdout.readline, ''):
                if not line:
                    break
                # Print to stdout so it goes to task log
                sys.stdout.write(line)
                sys.stdout.flush()
                # Write to file
                log_file.write(line)
                log_file.flush()
    except KeyboardInterrupt:
        print("Stopping uvicorn...", flush=True)
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        log_file.close()
        print("Uvicorn stopped.", flush=True)

if __name__ == "__main__":
    run()
