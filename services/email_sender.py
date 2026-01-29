import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
from dotenv import load_dotenv

load_dotenv()

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def send_email(to_email, subject, html_body):
    """
    Sends an HTML email using SMTP credentials from environment variables.
    Returns True if successful, False otherwise.
    """
    # Load Credentials
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_email = os.getenv("SMTP_EMAIL")
    smtp_password = os.getenv("SMTP_PASSWORD")

    if not smtp_email or not smtp_password:
        logging.error("SMTP credentials are missing!")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_email
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        # Connect and Send
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, to_email, msg.as_string())
        
        logging.info(f"Email sent successfully to {to_email}")
        return True

    except Exception as e:
        logging.error(f"Failed to send email to {to_email}: {e}")
        return False
