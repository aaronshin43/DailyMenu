import streamlit as st
import datetime
import uuid
from supabase import create_client, Client
from services.utils import get_available_stations, fetch_menu_data, parse_menu, filter_menu_for_user
from services.email_sender import send_email
from services.email_templates import generate_confirmation_email, generate_html_email

# --- Constants & Config ---
PAGE_TITLE = "Dickinson Daily Menu"

# --- Initialize Supabase ---
# Expects secrets in .streamlit/secrets.toml
try:
    SUPABASE_URL = st.secrets["supabase"]["url"]
    SUPABASE_KEY = st.secrets["supabase"]["key"]
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception:
    st.error("Supabase credentials not found. Please Set secrets in `.streamlit/secrets.toml`.")
    st.stop()

# --- Helper Functions ---
@st.cache_data(ttl=3600)  # Cache station data for 1 hour
def load_stations():
    try:
        return get_available_stations(datetime.date.today())
    except Exception as e:
        st.error(f"Error fetching stations: {e}")
        return []

def upsert_user(email, meals, stations):
    # This function is now used only for updating EXISTING users via token
    # New users are handled separately to enforce confirmation
    data = {
        # email is not needed for update if we use token, but upsert might need it if we used upsert
        # We will switch to update for existing users in the main logic
        "preferences": {
            "meals": meals,
            "stations": stations
        }
    }
    try:
        return True, "Preferences updated successfully!"
    except Exception as e:
        return False, f"Error saving preferences: {str(e)}"

def delete_user(token):
    try:
        response = supabase.table("users").update({"is_active": False}).eq("token", token).execute()
        return True, "Successfully unsubscribed. We'll miss you!"
    except Exception as e:
        return False, f"Error unsubscribing: {str(e)}"

def confirm_user(token):
    try:
        # Update is_active to True
        response = supabase.table("users").update({"is_active": True}).eq("token", token).execute()
        
        # Fetch user email to send welcome menu
        try:
            data = response.data[0]
            email = data['email']
            return True, email, "Subscription confirmed! sending today's menu..."
        except IndexError:
            return False, None, "Invalid token or user not found."
            
    except Exception as e:
        return False, None, f"Error confirming: {str(e)}"

# --- UI Layout ---
# Update page config with new icon
st.set_page_config(page_title=PAGE_TITLE, page_icon="assets/logo.png", layout="centered")

# Handle Query Parameters (Moved to main logic block)
# query_params = st.query_params
# default_email = query_params.get("email", "")
# action = query_params.get("action", "")

# Custom CSS for complete styling
st.markdown("""
<style>
    /* 1. Global Background */
    /* Light Mode Default: Gray Background, White Card */
    .stApp {
        background-color: #f0f2f6;
    }
    
    /* 2. Card Layout - Style the main container directly */
    .block-container {
        background-color: white;
        padding: 3rem !important;
        border-radius: 15px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        max-width: 700px;
        margin-top: 6rem;
    }

    /* 3. Hide Anchor Links (Chain icons next to headers) */
    a.anchor-link {
        display: none !important;
    }
    /* For newer Streamlit versions that use different classes for anchors */
    .st-emotion-cache-gi0tri,
    .st-emotion-cache-12rj9lz {
        display: none !important;
    }
    /* Generic catch-all for headers */
    h1 > a, h2 > a, h3 > a {
        display: none !important;
    }

    /* 4. Disable Image Click (Pointer Events) */
    .stImage img {
        pointer-events: none;
    }
    
    /* 5. Button Styling */
    .stButton>button {
        width: 100%;
        margin-top: 10px;
    }
</style>
""", unsafe_allow_html=True)

# 1. Header with Logo
col1, col2 = st.columns([1, 5])
with col1:
    st.image("assets/logo.png", width=70) # Image logic handled by CSS to be unclickable
with col2:
    st.title("Dickinson Daily Menu")
    
st.write("Get the cafeteria menu delivered to your inbox every morning around 7 AM.")
st.write("---")

# Handle Query Parameters
query_params = st.query_params
token = query_params.get("token", "")
action = query_params.get("action", "")

# Fetch User if Token Present
user_data = None
if token:
    try:
        res = supabase.table("users").select("*").eq("token", token).execute()
        if res.data:
            user_data = res.data[0]
        else:
            st.error("Invalid or expired token.")
            st.stop()
    except Exception as e:
        st.error("Error verifying token.")
        st.stop()

# --- CASE 1: Confirmation ---
if action == "confirm" and user_data:
    if user_data.get("is_active"):
        st.info("Your subscription is already active!")
    else:
        # 1. Confirm Subscription
        with st.spinner("Confirming subscription..."):
            success, email, msg = confirm_user(token)

        # 2. Handle Success & Send Menu (Independent Step)
        if success:
            st.success("✅ Subscription Confirmed!")
            st.balloons()
            
            # Send Today's Menu
            try:
                today = datetime.date.today()

                with st.spinner(f"Sending today's menu for {today.strftime('%b %d')}..."):
                    raw_data = fetch_menu_data(today)
                    menu_items = parse_menu(raw_data, target_date=today)
                    
                    if menu_items:
                        # Use user_data preferences
                        prefs = user_data.get('preferences', {})
                        filtered_items = filter_menu_for_user(menu_items, prefs)
                        
                        if filtered_items:
                            html_body = generate_html_email(filtered_items, today.strftime("%A, %B %d, %Y"), token)
                            subject = f"Dickinson Daily Menu - {today.strftime('%b %d')}"
                            send_email(email, subject, html_body)
                            st.info(f"📩 Today's menu has been sent to **{email}**.")
                        else:
                            st.warning("Today's menu is available, but nothing matched your current preferences.")
                    else:
                        st.warning("No menu data found for today (likely a weekend or break).")
                        
            except Exception as e:
                st.error(f"Could not send menu automatically: {e}")
                
        else:
            st.error(msg)
    # Fall through to show preferences form

# --- CASE 2: Unsubscribe ---
elif action == "unsubscribe" and user_data:
    st.error("⚠️ You are about to unsubscribe.")
    st.write(f"Email: **{user_data['email']}**")
    
    if st.button("Unsubscribe", type="primary"):
        success, msg = delete_user(token)
        if success:
            st.success(msg)
        else:
            st.error(msg)
    
    if st.button("Manage Preferences"):
        st.query_params["action"] = ""
        st.rerun()
    st.stop()

# --- CASE 3: Subscribe / Update ---

# 2. Email Input
if user_data:
    st.success(f"Managing preferences for: **{user_data['email']}**")
    email = user_data['email']
    # Pre-fill
    default_meals = user_data['preferences'].get('meals', [])
    default_stations = user_data['preferences'].get('stations', [])
else:
    email = st.text_input("📧  Email Address", placeholder="student@dickinson.edu")
    default_meals = ["breakfast", "lunch", "dinner"]
    default_stations = []

# 3. Preferences UI
st.subheader("Preferences")
col_meal, col_station = st.columns(2)

selected_meals = []
with col_meal:
    st.markdown("**Select Meals**")
    all_meals = ["breakfast", "lunch", "dinner"]
    for meal in all_meals:
        # Check if meal is in defaults (case insensitive)
        is_checked = meal in [m.lower() for m in default_meals]
        # If new user, default to all true using 'value=True' logic needs care
        if not user_data and not default_meals: is_checked = True 
        if not user_data and default_meals: is_checked = True # Default "breakfast","lunch","dinner"
        
        if st.checkbox(meal.capitalize(), value=is_checked, key=f"meal_{meal}"):
            selected_meals.append(meal)

with col_station:
    st.markdown("**Select Stations**")
    available_stations = load_stations()
    selected_stations = []
    
    # Calculate defaults
    defaults_to_show = []
    if available_stations:
        if user_data:
            defaults_to_show = [s for s in available_stations if s in default_stations]
        else:
            defaults_to_show = available_stations # Default all for new user
            
        selected_stations = st.multiselect(
            "Filter by Station",
            options=available_stations,
            default=defaults_to_show,
            label_visibility="collapsed"
        )
    else:
        st.info("Stations unavailable.")

# 4. Action Button
st.write("") 
btn_text = "Update Preferences" if user_data else "Subscribe"
btn_column = [1.1, 1, 1] if user_data else [1.4, 1, 1]

if st.columns(btn_column)[1].button(btn_text, type="primary"):
    if not email:
        st.warning("Please enter a valid email.")
    elif not selected_meals:
        st.warning("Please select at least one meal type.")
    elif not selected_stations:
        st.warning("Please select at least one station.")
    else:
        with st.spinner("Processing..."):
            if user_data:
                # Update Existing (via Token)
                # We do NOT let them change email here for security (verified by token)
                data = {
                    "preferences": {"meals": selected_meals, "stations": selected_stations}
                }
                try:
                    res = supabase.table("users").update(data).eq("token", token).execute()
                    st.success("Preferences updated successfully!")
                except Exception as e:
                    st.error(f"Error updating: {e}")
            else:
                # New User
                # 1. Generate Token
                new_token = str(uuid.uuid4())
                # 2. Insert with is_active=False
                data = {
                    "email": email,
                    "token": new_token,
                    "preferences": {"meals": selected_meals, "stations": selected_stations},
                    "is_active": False
                }
                try:
                    # Upsert on email conflict?
                    # If email exists, we might want to RESEND confirmation or treat as update?
                    # For security, let's just Upsert. It will reset the token and is_active=False.
                    res = supabase.table("users").upsert(data, on_conflict="email").execute()
                    
                    # 3. Send Confirmation Email
                    html = generate_confirmation_email(email, new_token)
                    send_success = send_email(email, "Confirm your Dickinson Daily Subscription", html)
                    
                    if send_success:
                        st.success("✅ Confirmation email sent!")
                        st.info(f"Please check your inbox (and junk folder) at {email} to activate your subscription.")
                    else:
                        st.error("Error sending confirmation email. Please try again.")
                        
                except Exception as e:
                    st.error(f"Error subscribing: {e}")


# Footer
st.markdown("""
<div style='text-align: center; color: #888; margin-top: 30px; font-size: 0.8em;'>
    Made with ❤️ for Dickinson College Students
</div>
""", unsafe_allow_html=True)

_ = """
/* Dark Mode Overrides */
@media (prefers-color-scheme: dark) {
    /* In Dark Mode: Dark Background, Gray Card */
    .stApp {
        background-color: #202124;
    }
    
    .stAppToolbar, .stMainMenuPopover, .st-emotion-cache-1v6glgu li, .stMainMenuPopover .st-f7 {
        background-color: #292a2d !important;
    }

    .st-emotion-cache-19i1c {
        border-top: 1px solid #d3d3d3 !important;
        opacity: 0.3;
    }

    .block-container {
        background-color: #292a2d;
        color: #e0e0e0; /* Light text for readability */
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.6);
    }

    /* Force text colors for various elements in dark mode to ensure visibility on gray card */
    h1, h2, h3, h4, h5, h6, p, li, span, div, label {
        color: #e0e0e0;
    }
    
    /* Specific override for Streamlit input labels if needed, though the above global might catch it */
    .stTextInput label, .stSelectbox label, .stMultiSelect label {
        color: #292a2d !important;
    }

    .stCheckbox span {
        border: 1px solid #e0e0e0 !important;
    }

    /* Input Fields & Multiselect (Dark Mode) */
    /* Using data-baseweb selectors for stability across re-renders */
    [data-baseweb="input"] > div,
    [data-baseweb="select"] > div {
        background-color: #292a2d !important;
        border-color: #ffffff !important;
        color: #ffffff !important;
    }

    /* Ensure the text inside the input/select is visible */
    [data-baseweb="input"] input,
    [data-baseweb="select"] span {
            color: #ffffff !important;
    }

    .st-fs .st-s7 {
        background-color: #292a2d !important;
    }

    /* Dropdown options container */
    .st-b7, .st-ex {
        background-color: #292a2d !important;
        scrollbar-color: #e0e0e0 !important;
    }

    .st-bc {
        color: #e0e0e0 !important;
        caret-color: #e0e0e0 !important;
    }

    .stTextInput input::placeholder {
        color: #9aa0a6 !important;
    }

    /* Dropdown cancel all icon */
    .st-en {
        color: #e0e0e0 !important;
    }

    .stTextInput input {
        background-color: #292a2d !important;
    }
        
    /* Horizontal Line (Dark Mode) */
    hr {
        border-color: #d3d3d3 !important; /* Light Gray */
        opacity: .3;
    }

    /* Manage preferences button */
    .st-emotion-cache-12yrha6 {
        background-color: rgba(151, 166, 195, 0.5);
    }
}
"""