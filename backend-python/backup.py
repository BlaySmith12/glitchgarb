"""
backup.py — Automated database backups (Rule 22)
Backups are useless if not tested. This script:
1. Creates a database backup
2. Verifies the backup can be restored
3. Logs the result
"""
import os
import time
from datetime import datetime
from dotenv import load_dotenv
import subprocess

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
BACKUP_DIR = os.getenv("BACKUP_DIR", "./backups")
RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))

def create_backup():
    """Create a database backup using pg_dump."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(BACKUP_DIR, f"glitchgarb_backup_{timestamp}.sql")
    
    # Extract connection details from DATABASE_URL
    # Format: postgresql+psycopg://user:pass@host:port/dbname?params
    db_url = DATABASE_URL.replace("postgresql+psycopg://", "postgresql://")
    
    # Check if pg_dump is available
    try:
        subprocess.run(['pg_dump', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  [BACKUP] pg_dump not found - skipping backup")
        return None, False
    
    cmd = f'pg_dump "{db_url}" -F c -f "{backup_file}"'
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"  [BACKUP] Created: {backup_file}")
            return backup_file, True
        else:
            print(f"  [BACKUP] Failed: {result.stderr}")
            return None, False
    except Exception as e:
        print(f"  [BACKUP] Error: {e}")
        return None, False

def test_backup(backup_file: str):
    """Test that the backup can be restored (Rule 22 - untested backup is useless)."""
    if not backup_file or not os.path.exists(backup_file):
        return False
    
    test_db = f"glitchgarb_test_restore_{int(time.time())}"
    
    try:
        # Create test database
        cmd_create = f'psql "{DATABASE_URL}" -c "CREATE DATABASE {test_db};"'
        subprocess.run(cmd_create, shell=True, capture_output=True)
        
        # Try to restore
        cmd_restore = f'pg_restore -d "{DATABASE_URL.replace("/" + DATABASE_URL.split("/")[-1], f"/{test_db}")}" "{backup_file}"'
        result = subprocess.run(cmd_restore, shell=True, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"  [BACKUP] Restore test PASSED")
            success = True
        else:
            print(f"  [BACKUP] Restore test FAILED: {result.stderr}")
            success = False
        
        # Cleanup test database
        cmd_drop = f'psql "{DATABASE_URL}" -c "DROP DATABASE IF EXISTS {test_db};"'
        subprocess.run(cmd_drop, shell=True, capture_output=True)
        
        return success
    except Exception as e:
        print(f"  [BACKUP] Test error: {e}")
        return False

def cleanup_old_backups():
    """Remove backups older than RETENTION_DAYS."""
    if not os.path.exists(BACKUP_DIR):
        return
    
    current_time = time.time()
    for filename in os.listdir(BACKUP_DIR):
        filepath = os.path.join(BACKUP_DIR, filename)
        if os.path.isfile(filepath):
            age_days = (current_time - os.path.getmtime(filepath)) / 86400
            if age_days > RETENTION_DAYS:
                os.remove(filepath)
                print(f"  [BACKUP] Removed old backup: {filename}")

def run_backup_job():
    """Main backup job - creates and tests backup."""
    print(f"\n  === Database Backup Job ===")
    print(f"  Time: {datetime.utcnow().isoformat()}")
    
    # Create backup
    backup_file, success = create_backup()
    
    if success and backup_file:
        # Test the backup
        test_result = test_backup(backup_file)
        
        if test_result:
            print(f"  [BACKUP] Backup verified and tested")
        else:
            print(f"  [BACKUP] Backup created but restore test failed")
    else:
        print(f"  [BACKUP] Backup creation failed")
    
    # Cleanup old backups
    cleanup_old_backups()
    
    print(f"  === Backup Job Complete ===\n")

if __name__ == "__main__":
    run_backup_job()
