# tfx2json

WIP: Convert Terraform / OpenTofu templates (.tf) to JSON for saner ops.

## Usage

- make sure git submodules are up to date
- run `npm install`
- run `npm run build`
- put something in `sample.tf`

given the following terraform template:

```terraform
provider "aws" {
  region = "eu-west-1"
}

data "aws_availability_zones" "available" {}

locals {
  cluster_name = "jasonb-eks"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "2.66.0"

  name                 = "jasonb-vpc"
  cidr                 = "10.0.0.0/16"
  azs                  = data.aws_availability_zones.available.names
  public_subnets       = ["10.0.4.0/24", "10.0.5.0/24", "10.0.6.0/24"]
  enable_dns_hostnames = true
}


resource "aws_security_group" "external_connection" {
  name_prefix = "all_worker_management"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"

    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }
}
```

currently it outputs:

```javascript
const config = {
  provider_aws: { region: "eu-west-1" },
  data_aws_availability_zones_available: {},
  locals: { cluster_name: "jasonb-eks" },
  module_vpc: {
    source: "terraform-aws-modules/vpc/aws",
    version: "2.66.0",
    name: "jasonb-vpc",
    cidr: "10.0.0.0/16",
    azs: data.aws_availability_zones.available.names,
    public_subnets: ["10.0.4.0/24", "10.0.5.0/24", "10.0.6.0/24"],
    enable_dns_hostnames: true,
  },
  resource_aws_security_group_external_connection: {
    name_prefix: "all_worker_management",
    vpc_id: module.vpc.vpc_id,
    ingress: { from_port: 22, to_port: 22, protocol: "tcp", cidr_blocks: ["0.0.0.0/0"] },
  },
};
```
