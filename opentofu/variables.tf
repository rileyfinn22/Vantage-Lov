variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "vantage-471500"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-west1"
}

variable "database_url" {
  description = "Database connection URL"
  type        = string
  sensitive   = false
  default     = "NADA"
}