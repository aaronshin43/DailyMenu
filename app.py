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

# --- UI Layout ---
# Update page config with new icon
st.set_page_config(page_title=PAGE_TITLE, page_icon="cutlery.png", layout="centered")

# Custom CSS for complete styling
st.markdown("""
<style>
    /* 1. Global Background */
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
        margin-top: 2rem;
    }
    
    /* 3. Hide Anchor Links (Chain icons next to headers) */
    a.anchor-link {
        display: none !important;
    }
    /* For newer Streamlit versions that use different classes for anchors */
    .st-emotion-cache-1629p8f h1 a, 
    .st-emotion-cache-1629p8f h2 a, 
    .st-emotion-cache-1629p8f h3 a {
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
        margin-top: 20px;
    }
</style>
""", unsafe_allow_html=True)

# 1. Header with Logo
col1, col2 = st.columns([1, 5])
with col1:
    st.image("cutlery.png", width=70) # Image logic handled by CSS to be unclickable
with col2:
    st.title("Dickinson Daily")
    
st.write("Get the cafeteria menu delivered to your inbox every morning at 7 AM.")
st.write("---")

# 2. Email Input
email = st.text_input("📧  Email Address", placeholder="student@dickinson.edu")

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
if st.button("Subscribe / Update Preferences", type="primary"):
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
