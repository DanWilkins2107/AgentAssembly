module "network" {
  source = "./modules/network"
  name   = local.name_prefix
}

module "vm" {
  source            = "./modules/vm"
  name              = local.name_prefix
  vpc_id            = module.network.vpc_id
  dns_resolver_cidr = module.network.dns_resolver_cidr
  harness_ref       = var.harness_ref
  agentjira_cli_ref = var.agentjira_cli_ref
}
