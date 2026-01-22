terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    # Configuration will be provided via backend.tfvars or environment variables
    # See backend.tfvars.example for required values
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}