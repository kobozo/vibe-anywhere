#!/bin/bash
set -e

# Vibe Anywhere Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/kobozo/vibe-anywhere/main/scripts/install.sh | sudo bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/vibe-anywhere"
SERVICE_USER="vibeanywhere"
SERVICE_GROUP="vibeanywhere"
DEFAULT_PORT="51420"
GITHUB_REPO="kobozo/vibe-anywhere"

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "=============================================="
    echo "       Vibe Anywhere Installation Script       "
    echo "=============================================="
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

prompt() {
    local prompt_text="$1"
    local default_value="$2"
    local result

    if [ -n "$default_value" ]; then
        read -p "$prompt_text [$default_value]: " result
        echo "${result:-$default_value}"
    else
        read -p "$prompt_text: " result
        echo "$result"
    fi
}

prompt_password() {
    local prompt_text="$1"
    local result

    read -s -p "$prompt_text: " result
    echo ""
    echo "$result"
}

prompt_yes_no() {
    local prompt_text="$1"
    local default="$2"
    local result

    if [ "$default" = "y" ]; then
        read -p "$prompt_text [Y/n]: " result
        result="${result:-y}"
    else
        read -p "$prompt_text [y/N]: " result
        result="${result:-n}"
    fi

    [[ "$result" =~ ^[Yy] ]]
}

generate_secret() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "Cannot detect OS. This script requires Debian or Ubuntu."
        exit 1
    fi

    if [[ "$OS" != "debian" && "$OS" != "ubuntu" ]]; then
        log_error "This script only supports Debian and Ubuntu. Detected: $OS"
        exit 1
    fi

    log_info "Detected OS: $OS $VERSION"
}

get_latest_version() {
    curl -s "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/'
}

install_nodejs() {
    log_info "Installing Node.js 22..."

    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

    apt-get install -y nodejs

    log_info "Node.js $(node --version) installed"
}

install_postgresql() {
    log_info "Installing PostgreSQL 16..."

    # Add PostgreSQL repository
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

    apt-get update
    apt-get install -y postgresql-16

    # Start PostgreSQL
    systemctl enable postgresql
    systemctl start postgresql

    log_info "PostgreSQL 16 installed and started"
}

install_docker() {
    log_info "Installing Docker..."

    # Install prerequisites
    apt-get install -y ca-certificates curl gnupg

    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Add the repository
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Start Docker
    systemctl enable docker
    systemctl start docker

    log_info "Docker installed and started"
}

create_user() {
    log_info "Creating service user..."

    if id "$SERVICE_USER" &>/dev/null; then
        log_warn "User $SERVICE_USER already exists"
    else
        useradd --system --shell /bin/bash --home-dir /home/$SERVICE_USER --create-home $SERVICE_USER
        log_info "Created user $SERVICE_USER"
    fi

    # Add to docker group if Docker is installed
    if getent group docker > /dev/null 2>&1; then
        usermod -aG docker $SERVICE_USER
        log_info "Added $SERVICE_USER to docker group"
    fi
}

setup_database() {
    local db_password="$1"

    log_info "Setting up PostgreSQL database..."

    # Create database user and database
    sudo -u postgres psql <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vibeanywhere') THEN
        CREATE USER vibeanywhere WITH PASSWORD '$db_password';
    ELSE
        ALTER USER vibeanywhere WITH PASSWORD '$db_password';
    END IF;
END
\$\$;

SELECT 'CREATE DATABASE vibeanywhere OWNER vibeanywhere'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vibeanywhere')\gexec

GRANT ALL PRIVILEGES ON DATABASE vibeanywhere TO vibeanywhere;
EOF

    log_info "Database configured"
}

download_release() {
    local version="$1"

    log_info "Downloading Vibe Anywhere v${version}..."

    local download_url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/vibe-anywhere-v${version}.tar.gz"

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Download and extract
    curl -fsSL "$download_url" | tar -xzf - -C "$INSTALL_DIR" --strip-components=1

    log_info "Downloaded and extracted to $INSTALL_DIR"
}

create_env_file() {
    local db_password="$1"
    local auth_secret="$2"

    log_info "Creating configuration file..."

    cat > "$INSTALL_DIR/.env" <<EOF
# Vibe Anywhere Configuration
# Generated by install.sh on $(date)

# Server
NODE_ENV=production
PORT=${DEFAULT_PORT}

# Database
DATABASE_URL=postgresql://vibeanywhere:${db_password}@localhost:5432/vibeanywhere

# Authentication
AUTH_SECRET=${auth_secret}
EOF

    # Set ownership
    chown $SERVICE_USER:$SERVICE_GROUP "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"

    log_info "Configuration file created"
}

add_proxmox_config() {
    local proxmox_host="$1"
    local proxmox_port="$2"
    local proxmox_token_id="$3"
    local proxmox_token_secret="$4"
    local proxmox_node="$5"
    local proxmox_template_vmid="$6"
    local proxmox_ssh_user="$7"
    local proxmox_ssh_key_path="$8"

    cat >> "$INSTALL_DIR/.env" <<EOF

# Proxmox Backend
PROXMOX_HOST=${proxmox_host}
PROXMOX_PORT=${proxmox_port}
PROXMOX_TOKEN_ID=${proxmox_token_id}
PROXMOX_TOKEN_SECRET=${proxmox_token_secret}
PROXMOX_NODE=${proxmox_node}
PROXMOX_TEMPLATE_VMID=${proxmox_template_vmid}
PROXMOX_SSH_USER=${proxmox_ssh_user}
PROXMOX_SSH_PRIVATE_KEY_PATH=${proxmox_ssh_key_path}
PROXMOX_STORAGE=local-lvm
PROXMOX_BRIDGE=vmbr0
PROXMOX_VMID_MIN=200
PROXMOX_VMID_MAX=299
PROXMOX_MEMORY_MB=4096
PROXMOX_CORES=4
EOF
}

run_migrations() {
    log_info "Running database migrations..."

    cd "$INSTALL_DIR"

    # Install tsx for running TypeScript migrations
    npm install -g tsx

    # Push schema to database
    sudo -u $SERVICE_USER bash -c "cd $INSTALL_DIR && DATABASE_URL='postgresql://vibeanywhere:$1@localhost:5432/vibeanywhere' npx drizzle-kit push --force"

    log_info "Database migrations complete"
}

create_admin_user() {
    local username="$1"
    local password="$2"
    local db_password="$3"

    log_info "Creating admin user..."

    cd "$INSTALL_DIR"

    sudo -u $SERVICE_USER bash -c "cd $INSTALL_DIR && DATABASE_URL='postgresql://vibeanywhere:$db_password@localhost:5432/vibeanywhere' npx tsx scripts/seed-user.ts '$username' '$password'"

    log_info "Admin user '$username' created"
}

install_service() {
    log_info "Installing systemd service..."

    cp "$INSTALL_DIR/scripts/vibe-anywhere.service" /etc/systemd/system/

    systemctl daemon-reload
    systemctl enable vibe-anywhere

    log_info "Service installed and enabled"
}

start_service() {
    log_info "Starting Vibe Anywhere..."

    systemctl start vibe-anywhere

    # Wait a moment for the service to start
    sleep 3

    if systemctl is-active --quiet vibe-anywhere; then
        log_info "Vibe Anywhere is running"
    else
        log_error "Failed to start Vibe Anywhere. Check logs with: journalctl -u vibe-anywhere"
        exit 1
    fi
}

print_success() {
    local ip_address
    ip_address=$(hostname -I | awk '{print $1}')

    echo ""
    echo -e "${GREEN}=============================================="
    echo "       Installation Complete!                "
    echo "==============================================${NC}"
    echo ""
    echo -e "Access Vibe Anywhere at: ${BLUE}http://${ip_address}:${DEFAULT_PORT}${NC}"
    echo ""
    echo "Service commands:"
    echo "  sudo systemctl status vibe-anywhere   - Check status"
    echo "  sudo systemctl restart vibe-anywhere  - Restart service"
    echo "  sudo journalctl -u vibe-anywhere -f   - View logs"
    echo ""
    echo "Configuration file: $INSTALL_DIR/.env"
    echo ""
}

# Main installation flow
main() {
    print_banner
    check_root
    check_os

    # Update package lists
    log_info "Updating package lists..."
    apt-get update

    # Install basic dependencies
    log_info "Installing basic dependencies..."
    apt-get install -y curl wget gnupg lsb-release git

    echo ""
    echo -e "${BLUE}=== Configuration ===${NC}"
    echo ""

    # Get version
    LATEST_VERSION=$(get_latest_version)
    if [ -z "$LATEST_VERSION" ]; then
        LATEST_VERSION="1.0.0"
        log_warn "Could not fetch latest version, using $LATEST_VERSION"
    fi
    VERSION=$(prompt "Version to install" "$LATEST_VERSION")

    # Docker installation
    if prompt_yes_no "Install Docker?" "y"; then
        INSTALL_DOCKER=true
    else
        INSTALL_DOCKER=false
    fi

    # Proxmox configuration (only backend supported)
    echo ""
    echo -e "${BLUE}=== Proxmox Configuration ===${NC}"
    echo "Vibe Anywhere uses Proxmox LXC for workspace isolation."
    echo ""
    PROXMOX_HOST=$(prompt "Proxmox host" "")
    PROXMOX_PORT=$(prompt "Proxmox port" "8006")
    PROXMOX_TOKEN_ID=$(prompt "Proxmox API token ID (user@realm!tokenid)" "")
    PROXMOX_TOKEN_SECRET=$(prompt "Proxmox API token secret" "")
    PROXMOX_NODE=$(prompt "Proxmox node name" "pve")
    PROXMOX_TEMPLATE_VMID=$(prompt "Template VMID" "150")
    PROXMOX_SSH_USER=$(prompt "SSH user for Proxmox" "root")
    PROXMOX_SSH_KEY_PATH=$(prompt "SSH private key path" "/root/.ssh/id_rsa")

    # Admin user
    echo ""
    echo -e "${BLUE}=== Admin User ===${NC}"
    ADMIN_USERNAME=$(prompt "Admin username" "admin")
    ADMIN_PASSWORD=$(prompt_password "Admin password")
    while [ -z "$ADMIN_PASSWORD" ]; do
        log_warn "Password cannot be empty"
        ADMIN_PASSWORD=$(prompt_password "Admin password")
    done

    # Generate secrets
    DB_PASSWORD=$(generate_secret)
    AUTH_SECRET=$(generate_secret)

    echo ""
    echo -e "${BLUE}=== Installing ===${NC}"
    echo ""

    # Install components
    install_nodejs
    install_postgresql

    if [ "$INSTALL_DOCKER" = true ]; then
        install_docker
    fi

    # Create service user
    create_user

    # Setup database
    setup_database "$DB_PASSWORD"

    # Download release
    download_release "$VERSION"

    # Set ownership of install directory
    chown -R $SERVICE_USER:$SERVICE_GROUP "$INSTALL_DIR"

    # Create configuration
    create_env_file "$DB_PASSWORD" "$AUTH_SECRET"

    # Add Proxmox configuration
    add_proxmox_config "$PROXMOX_HOST" "$PROXMOX_PORT" "$PROXMOX_TOKEN_ID" "$PROXMOX_TOKEN_SECRET" "$PROXMOX_NODE" "$PROXMOX_TEMPLATE_VMID" "$PROXMOX_SSH_USER" "$PROXMOX_SSH_KEY_PATH"

    # Run migrations
    run_migrations "$DB_PASSWORD"

    # Create admin user
    create_admin_user "$ADMIN_USERNAME" "$ADMIN_PASSWORD" "$DB_PASSWORD"

    # Install and start service
    install_service
    start_service

    print_success
}

# Run main function
main "$@"
