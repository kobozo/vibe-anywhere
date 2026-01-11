# Segment 7: Container Status Dashboard

**Duration:** 10 seconds

---

## First Frame (Screenshot Description)

Dashboard panel view showing workspace details in a card-based layout:

**Agent Status Card:**
- Title: "Agent"
- Status: Green dot + "Connected"
- Version: "v3.0.0"
- Last heartbeat: "2 seconds ago"

**Container Info Card:**
- Title: "Container"
- VMID: "201"
- IP Address: "192.168.3.45"
- Status: Green "Running"
- Uptime: "2h 34m"

**Template Card:**
- Title: "Template"
- Name: "debian-12-dev"
- Tech Stacks: Node.js, Claude CLI, Git

**Action Buttons Row:**
- Restart (icon)
- Shutdown (icon)
- Redeploy (icon)
- Delete (icon, red)

### Key Visual Elements
- Card-based layout
- Status indicators with colors
- Real-time data (heartbeat, uptime)
- Version information
- IP address display
- Action button row
- Clean spacing

---

## Video Content (10 seconds)

**0-2 sec**: Focus on Agent Status card. The "Last heartbeat" timestamp updates from "2 seconds ago" to "just now" - showing real-time updates.

**2-4 sec**: User moves cursor to "Restart" button and clicks.

**4-5 sec**: Confirmation dialog appears:
- "Restart Container?"
- "This will restart the container and reconnect the agent."
- Cancel / Confirm buttons

User clicks "Confirm".

**5-7 sec**: Container Status changes:
- Status: Yellow "Restarting" with spinner
- Uptime: Resets

**7-9 sec**: Status transitions back to:
- Status: Green "Running"
- Agent: Reconnects (brief "Connecting..." then "Connected")
- Uptime: "0m 1s"

**9-10 sec**: Text overlay: "Full control. Zero SSH."

### Motion & Effects
- Real-time timestamp update
- Button hover/click animation
- Dialog fade-in
- Status spinner animation
- Color transitions
- Reconnection indicator
- Text fade-in

---

## Production Checklist

- [ ] Dashboard panel with all cards
- [ ] Real-time heartbeat updating
- [ ] Restart confirmation dialog
- [ ] Container restart demonstration
- [ ] Agent reconnection visible
- [ ] Text overlay: "Full control. Zero SSH."
