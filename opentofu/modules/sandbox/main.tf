resource "google_cloud_run_v2_service" "this" {
  name     = var.name
  location = var.region

  deletion_protection = false
  template {
    service_account = var.service_account_email

    vpc_access {
      network_interfaces {
        network    = var.database_network
        subnetwork = var.subnet_id
      }
    }

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:${var.tag}"
      name = "app"

      ports {
        container_port = 3030
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "1Gi"
        }
      }

      env {
        name  = "DB_HOST"
        value = var.database_private_ip
      }

      env {
        name  = "DB_USER"
        value = "postgres"
      }

      env {
        name  = "DB_DATABASE"
        value = var.db_database
      }

      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = var.db_password_secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "HOST"
        value = "*.us-west1.run.app"
      }

      env {
        name  = "TENANT_NAME"
        value = var.tenant_name
      }

      env {
        name = "MISE_SOPS_AGE_KEY"
        value_source {
          secret_key_ref {
            secret  = var.age_key_secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "NODE_ENV"
        value = "production"
      }

      env {
        name = "TRANSCRIPTION_SERVICE"
        value = "elevenlabs"
      }

      dynamic "startup_probe" {
        for_each = var.enable_health_checks ? [1] : []
        content {
          http_get {
            path = "/health"
            port = 3030
          }
          initial_delay_seconds = 5
          timeout_seconds       = 3
          period_seconds        = 10
          failure_threshold     = 3
        }
      }

      dynamic "liveness_probe" {
        for_each = var.enable_health_checks ? [1] : []
        content {
          http_get {
            path = "/health"
            port = 3030
          }
          initial_delay_seconds = 5
          timeout_seconds       = 3
          period_seconds        = 10
          failure_threshold     = 3
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

resource "google_cloud_run_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.this.location
  service  = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Migration job for this sandbox
resource "google_cloud_run_v2_job" "migrate" {
  name     = "migrate-${var.tenant_name}"
  location = var.region

  deletion_protection = false

  template {
    template {
      service_account = var.service_account_email

      vpc_access {
        network_interfaces {
          network    = var.database_network
          subnetwork = var.subnet_id
        }
      }

      containers {
        image   = "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:latest"
        command = ["pnpm"]
        args    = ["drizzle-kit", "migrate"]

        env {
          name  = "DB_HOST"
          value = var.database_private_ip
        }

        env {
          name  = "DB_USER"
          value = "postgres"
        }

        env {
          name  = "DB_DATABASE"
          value = var.db_database
        }

        env {
          name = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = var.db_password_secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "MISE_SOPS_AGE_KEY"
          value_source {
            secret_key_ref {
              secret  = var.age_key_secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }
}

# Seed job for this sandbox
resource "google_cloud_run_v2_job" "seed" {
  name     = "seed-${var.tenant_name}"
  location = var.region

  deletion_protection = false

  template {
    template {
      service_account = var.service_account_email

      vpc_access {
        network_interfaces {
          network    = var.database_network
          subnetwork = var.subnet_id
        }
      }

      containers {
        image   = "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:latest"
        command = ["pnpm"]
        args    = ["tsx", "utils/seedDatabaseUrl.ts"]

        env {
          name  = "DB_HOST"
          value = var.database_private_ip
        }

        env {
          name  = "DB_USER"
          value = "postgres"
        }

        env {
          name  = "DB_DATABASE"
          value = var.db_database
        }

        env {
          name = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = var.db_password_secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "MISE_SOPS_AGE_KEY"
          value_source {
            secret_key_ref {
              secret  = var.age_key_secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }
}
