# Tech Stacks Guide

## Structure
- id: Unique identifier
- name: Display name
- description: User-facing description
- installScript: Bash script (run as root)
- verifyCommand: Test command
- tags: For filtering

## User Tools
Install as kobozo user:
```bash
su - kobozo -c "npm install -g package"
```

## System Tools
Install as root:
```bash
apt-get install -y package
```
