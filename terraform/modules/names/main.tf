# Every cross-stack name lives here. Stacks (root, iam, bootstrap) each instantiate
# this module rather than rebuilding names from a duplicated prefix, so a rename is
# a one-line change. The module holds no resources and no state.
#
# The one name it cannot own is the backend block in terraform/backend.tf: backend
# HCL is parsed before evaluation, so it must repeat state_bucket and lock_table as
# literals. Rename here -> rename there.
locals {
  prefix = "agentassembly"
}
