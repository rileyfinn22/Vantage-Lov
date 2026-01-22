# GCS Backend Configuration
# Copy this file to backend.tfvars and fill in your values
# Usage: tofu init -backend-config=backend.tfvars

# GCS bucket name for storing Terraform state
# This bucket must exist before running tofu init
bucket = "vantage-471500-opentofu"

# Path within the bucket where state will be stored
prefix = "terraform-1/state"

# (Optional) Customer-managed encryption key
# Format: projects/PROJECT_ID/locations/LOCATION/keyRings/KEYRING/cryptoKeys/KEY
# encryption_key = ""

# (Optional) Credentials file path
# If not specified, will use Application Default Credentials (ADC)
# credentials = "/path/to/service-account-key.json"

# (Optional) Enable state locking (default: true)
# enable_bucket_policy_only = true