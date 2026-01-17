# Git Troubleshooting

## Decryption fails
**Solution**: Verify AUTH_SECRET unchanged, check encryption salt matches

## ls-remote fails
**Solution**: Verify SSH key valid, test clone URL manually, check network

## Git hooks don't execute
**Solution**: Verify base64 encoding, check executable flag, test manually in container
