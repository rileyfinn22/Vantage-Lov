# Cloud Build trigger removed to avoid GitHub connection requirements
# For manual deployment, use: docker build + docker push + gcloud run deploy

resource "google_cloudbuild_trigger" "github_trigger" {
  name        = "vantage-app-build"
  description = "Build and push Docker image from GitHub"
  location    = var.region

  github {
    owner = "alexmherrmann"
    name  = "vantage2"

    push {
      tag = "^v.*$"
    }
  }

  build {
    # images = [
    #   "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:$COMMIT_SHA",
    #   "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:$TAG_NAME",
    #   "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:latest"
    # ]
    step {
      name       = "gcr.io/cloud-builders/docker"
      env  = ["DOCKER_BUILDKIT=1", "MISE_SOPS_STRICT=false"]
      entrypoint = "bash"
      args = [
        "-c",
        "docker buildx create --name cloudbuilder --driver docker-container --use && docker buildx inspect --bootstrap"
      ]
    }

    step {
      name = "gcr.io/cloud-builders/docker"
      env  = ["DOCKER_BUILDKIT=1", "MISE_SOPS_STRICT=false"]
      args = [
        "buildx", "build",
        "--push",
        "--cache-from", "type=registry,ref=${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/cache",
        "--cache-to", "type=registry,ref=${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/cache,mode=max",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:$COMMIT_SHA",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:$TAG_NAME",
        "-t", "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu/app:latest",
        "."
      ]
    }

    # step {
    #   name = "gcr.io/google.com/cloudsdktool/cloud-sdk"
    #   entrypoint = "gcloud"
    #   args = [
    #     "run",
    #     "deploy",
    #     "vantage-app",
    #     "--image", "${var.region}-docker.pkg.dev/${var.project_id}/vantage-app-tofu:$COMMIT_SHA",
    #     "--region", var.region,
    #     "--platform", "managed"
    #   ]
    # }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }
  }

  service_account = google_service_account.cloudbuild_sa.id

  depends_on = [
    google_artifact_registry_repository.docker_repo,
    google_service_account.cloudbuild_sa
  ]
}
