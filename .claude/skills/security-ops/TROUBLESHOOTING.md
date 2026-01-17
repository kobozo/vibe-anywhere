# Security Troubleshooting

## Password validation fails
**Solution**: Check requirements (8+ chars, upper, lower, number)

## Decryption fails
**Solution**: Verify AUTH_SECRET unchanged, check salt

## Audit log not recording
**Solution**: Verify logUserAction called, check database connection
