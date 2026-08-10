"""
audit.py — Audit logging for critical actions (Rule 20)
Logs: deletions, role changes, payments, exports
"""
import json
import os
from datetime import datetime
from typing import Optional

class AuditLogger:
    """Simple audit logger that writes to file."""
    
    def __init__(self, log_file: str = "audit.log"):
        self.log_file = log_file
        # Ensure file exists
        if not os.path.exists(log_file):
            with open(log_file, 'w') as f:
                f.write("")  # Create empty file
    
    def log(
        self,
        action: str,
        user_id: Optional[str] = None,
        resource: Optional[str] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
        success: bool = True
    ):
        """
        Log a critical action.
        Actions: delete_user, change_role, payment, export_data, delete_order, etc.
        """
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "user_id": user_id,
            "resource": resource,
            "details": details or {},
            "ip_address": ip_address,
            "success": success
        }
        
        with open(self.log_file, 'a') as f:
            f.write(json.dumps(entry) + "\n")
    
    def log_deletion(self, resource_type: str, resource_id: str, user_id: str, ip: str = None):
        """Log a deletion event."""
        self.log(
            action=f"delete_{resource_type}",
            user_id=user_id,
            resource=resource_id,
            details={"resource_type": resource_type, "resource_id": resource_id},
            ip_address=ip,
            success=True
        )
    
    def log_role_change(self, user_id: str, old_role: str, new_role: str, admin_id: str, ip: str = None):
        """Log a role change event."""
        self.log(
            action="change_role",
            user_id=admin_id,
            resource=user_id,
            details={
                "target_user": user_id,
                "old_role": old_role,
                "new_role": new_role
            },
            ip_address=ip
        )
    
    def log_payment(self, order_id: str, amount: float, user_id: str, status: str, ip: str = None):
        """Log a payment event."""
        self.log(
            action="payment",
            user_id=user_id,
            resource=order_id,
            details={
                "order_id": order_id,
                "amount": amount,
                "status": status
            },
            ip_address=ip,
            success=(status == "success")
        )
    
    def log_export(self, export_type: str, user_id: str, record_count: int, ip: str = None):
        """Log a data export event."""
        self.log(
            action="export_data",
            user_id=user_id,
            resource=export_type,
            details={
                "export_type": export_type,
                "record_count": record_count
            },
            ip_address=ip
        )


# Global audit logger instance
audit_logger = AuditLogger()
