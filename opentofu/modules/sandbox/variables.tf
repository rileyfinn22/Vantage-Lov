variable "name" {
  description = "Name of the Cloud Run service"
  type        = string
}

variable "tenant_name" {
  description = "Tenant name for the TENANT_NAME environment variable"
  type        = string
}

variable "db_database" {
  description = "Database name for the DB_DATABASE environment variable"
  type        = string
}

variable "region" {
  description = "GCP region for the Cloud Run service"
  type        = string
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "service_account_email" {
  description = "Email of the service account for Cloud Run"
  type        = string
}

variable "database_private_ip" {
  description = "Private IP address of the database instance"
  type        = string
}

variable "database_network" {
  description = "Network for VPC access"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for VPC access"
  type        = string
}

variable "db_password_secret_id" {
  description = "Secret ID for database password"
  type        = string
}

variable "age_key_secret_id" {
  description = "Secret ID for AGE encryption key"
  type        = string
}

variable "tag" {
  description = "The image version to deploy"
  type = string
  default = "latest"
}

variable "enable_health_checks" {
  description = "Enable startup and liveness probes. Disable for initial deployment if database is not set up yet."
  type        = bool
  default     = true
}
