module "names" {
  source = "./modules/names"
}

locals {
  region      = "eu-west-2"
  name_prefix = module.names.prefix

  # Single top-level key prefix in the egress-log bucket. The VM's write-only
  # grant is scoped to it, so the shipper must put objects under this prefix.
  egress_log_prefix = "squid"

  common_tags = {
    Project   = local.name_prefix
    ManagedBy = "terraform"
  }
}
