import streamlit as st
import datetime
from supabase import create_client, Client
from utils import get_available_stations

# --- Constants & Config ---
PAGE_TITLE = "Dickinson Dining Daily"
PAGE_ICON = "🍽️"

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
    data = {
        "email": email,
        "preferences": {
            "meals": meals,
            "stations": stations
        },
        "is_active": True
    }
    try:
        # Upsert: requires conflict handling on 'email'
        response = supabase.table("users").upsert(data).execute()
        return True, "Subscription updated successfully!"
    except Exception as e:
        return False, f"Error saving subscription: {str(e)}"

def delete_user(email):
    try:
        response = supabase.table("users").update({"is_active": False}).eq("email", email).execute()
        return True, "Successfully unsubscribed. We'll miss you!"
    except Exception as e:
        return False, f"Error unsubscribing: {str(e)}"

# --- UI Layout ---
# Update page config with new icon
st.set_page_config(page_title=PAGE_TITLE, page_icon="logo.png", layout="centered")

# Handle Query Parameters
query_params = st.query_params
default_email = query_params.get("email", "")
action = query_params.get("action", "")

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
    st.image("logo.png", width=70) # Image logic handled by CSS to be unclickable
with col2:
    st.title("Dickinson Daily")
    
st.write("Get the cafeteria menu delivered to your inbox every morning around 7 AM.")
st.write("---")

# --- Unsubscribe Flow ---
if action == "unsubscribe" and default_email:
    st.error("⚠️ You are about to unsubscribe.")
    st.write(f"Email: **{default_email}**")
    st.write("Are you sure you want to stop receiving daily menus?")
    
    if st.button("Unsubscribe", type="primary"):
        success, msg = delete_user(default_email)
        if success:
            st.success(msg)
            # Make sure it stops execution or redirects
        else:
            st.error(msg)
            
    if st.button("Manage Preferences"):
        # Clear action param to return to main view
        # We explicitly set only the email to keep the URL clean (e.g., /?email=...)
        st.query_params.clear()
        st.query_params["email"] = default_email
        st.rerun()
        
    # Stop processing the rest of the page if in unsubscribe mode
    st.stop()


# --- Main Subscription Flow ---

# 2. Email Input
email = st.text_input("📧  Email Address", value=default_email, placeholder="student@dickinson.edu")

# 3. Preferences
st.subheader("Preferences")

col_meal, col_station = st.columns(2)

with col_meal:
    st.markdown("**Select Meals**")
    all_meals = ["breakfast", "lunch", "dinner"]
    selected_meals = []
    for meal in all_meals:
        if st.checkbox(meal.capitalize(), value=True, key=f"meal_{meal}"):
            selected_meals.append(meal)

with col_station:
    st.markdown("**Select Stations**")
    available_stations = load_stations()
    selected_stations = []
    if available_stations:
        selected_stations = st.multiselect(
            "Filter by Station",
            options=available_stations,
            default=available_stations,
            label_visibility="collapsed"
        )
    else:
            st.info("Stations unavailable.")

# 4. Action
st.write("") # Spacer
if st.columns([1.2, 1, 1])[1].button("Subscribe / Update", type="primary"):
    if not email:
        st.warning("Please enter a valid email.")
    elif not selected_meals:
            st.warning("Please select at least one meal type.")
    elif not selected_stations:
            st.warning("Please select at least one station.")
    else:
        with st.spinner("Saving preferences..."):
            success, msg = upsert_user(email, selected_meals, selected_stations)
            if success:
                st.success(msg)
                st.balloons()
            else:
                st.error(msg)


# Footer
st.markdown("""
<div style='text-align: center; color: #888; margin-top: 30px; font-size: 0.8em;'>
    Made with ❤️ for Dickinson College Students
</div>
""", unsafe_allow_html=True)
