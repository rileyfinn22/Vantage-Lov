resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.region
  repository_id = "vantage-app-tofu"
  description   = "Docker repository for Vantage application"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"

    condition {
      tag_state    = "UNTAGGED"
      older_than   = "2592000s"
    }
  }
}