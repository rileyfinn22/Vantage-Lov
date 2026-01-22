# Cloud Run service for sandbox environment
# To deploy manually after building image:
# gcloud run deploy vantage-app-sandbox --image us-west1-docker.pkg.dev/vantage-471500/vantage-app-sandbox:latest --region us-west1

# Shared data sources
data "google_sql_database_instance" "sandbox_db" {
  name = "vantage-dev"
}

# Get the default subnet for the region to match the database network configuration
data "google_compute_subnetwork" "default" {
  name   = "default"
  region = var.region
}

# Sandbox 1
module "sandbox1" {
  count = 0
  source = "./modules/sandbox"

  name        = "vantage-app-sandbox1"
  tenant_name = "sandbox1"
  db_database = "sandbox-1"

  tag                  = "v0.0.1-alpha.4"
  enable_health_checks = false

  region                 = var.region
  project_id             = var.project_id
  service_account_email  = google_service_account.cloudrun_sa.email
  database_private_ip    = data.google_sql_database_instance.sandbox_db.private_ip_address
  database_network       = data.google_sql_database_instance.sandbox_db.settings[0].ip_configuration[0].private_network
  subnet_id              = data.google_compute_subnetwork.default.id
  db_password_secret_id  = google_secret_manager_secret.sandbox_db_password.secret_id
  age_key_secret_id      = google_secret_manager_secret.prod_age_key.secret_id
}

# Sandbox 2
module "sandbox2" {
  count = 0
  source = "./modules/sandbox"

  name        = "vantage-app-sandbox2"
  tenant_name = "sandbox2"
  db_database = "sandbox-2"

  tag                  = "v0.0.3-beta.0"
  enable_health_checks = false

  region                 = var.region
  project_id             = var.project_id
  service_account_email  = google_service_account.cloudrun_sa.email
  database_private_ip    = data.google_sql_database_instance.sandbox_db.private_ip_address
  database_network       = data.google_sql_database_instance.sandbox_db.settings[0].ip_configuration[0].private_network
  subnet_id              = data.google_compute_subnetwork.default.id
  db_password_secret_id  = google_secret_manager_secret.sandbox_db_password.secret_id
  age_key_secret_id      = google_secret_manager_secret.prod_age_key.secret_id
}
