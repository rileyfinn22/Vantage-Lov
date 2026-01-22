resource "google_secret_manager_secret" "prod_age_key" {
  secret_id = "prod-age-key"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret" "sandbox_db_password" {
  secret_id = "sandbox-db-password"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

# Note: The secret values need to be created manually or via separate process
# You can create them with:
# gcloud secrets create prod-age-key --data-file=prod.age-key.txt --replication-policy=user-managed --locations=us-west1
# gcloud secrets create sandbox-db-password --data-file=- --replication-policy=user-managed --locations=us-west1