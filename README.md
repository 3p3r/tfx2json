# tfx2json

WIP: Convert Terraform / OpenTofu templates (.tf) to JSON for saner ops.

## Usage

Go 1.22+ and tinygo are required for building.

- make sure git submodules are up to date
- run `npm install`
- run `npm run build`
- put something in `sample.tf`
- run `npm run start`

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
  vpc_id2      = module.vpc.vpc_id[*].0
  vpc_id      = module.vpc.vpc_id.*.0
  rando       = var.create_secondary_cluster ? 1 : 0

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

```json
{
  "data": {
    "aws_availability_zones": {
      "available": [
        {}
      ]
    }
  },
  "locals": [
    {
      "cluster_name": "jasonb-eks"
    }
  ],
  "module": {
    "vpc": [
      {
        "azs": {
          "fn": "expression",
          "args": [
            {
              "name": "term",
              "value": {
                "fn": "identifier",
                "args": [
                  {
                    "name": "name",
                    "value": "data"
                  }
                ]
              }
            },
            {
              "name": "rest",
              "value": [
                "aws_availability_zones",
                "available",
                "names"
              ]
            }
          ]
        },
        "cidr": "10.0.0.0/16",
        "enable_dns_hostnames": true,
        "name": "jasonb-vpc",
        "public_subnets": [
          "10.0.4.0/24",
          "10.0.5.0/24",
          "10.0.6.0/24"
        ],
        "source": "terraform-aws-modules/vpc/aws",
        "version": "2.66.0"
      }
    ]
  },
  "provider": {
    "aws": [
      {
        "region": "eu-west-1"
      }
    ]
  },
  "resource": {
    "aws_security_group": {
      "external_connection": [
        {
          "ingress": [
            {
              "cidr_blocks": [
                "0.0.0.0/0"
              ],
              "from_port": 22,
              "protocol": "tcp",
              "to_port": 22
            }
          ],
          "name_prefix": "all_worker_management",
          "rando": {
            "fn": "conditional",
            "args": [
              {
                "name": "cond",
                "value": {
                  "fn": "expression",
                  "args": [
                    {
                      "name": "term",
                      "value": {
                        "fn": "identifier",
                        "args": [
                          {
                            "name": "name",
                            "value": "var"
                          }
                        ]
                      }
                    },
                    {
                      "name": "rest",
                      "value": [
                        "create_secondary_cluster"
                      ]
                    }
                  ]
                }
              },
              {
                "name": "true",
                "value": "1"
              },
              {
                "name": "false",
                "value": "0"
              }
            ]
          },
          "vpc_id": {
            "fn": "expression",
            "args": [
              {
                "name": "term",
                "value": {
                  "fn": "identifier",
                  "args": [
                    {
                      "name": "name",
                      "value": "module"
                    }
                  ]
                }
              },
              {
                "name": "rest",
                "value": [
                  "vpc",
                  "vpc_id",
                  "*",
                  0
                ]
              }
            ]
          },
          "vpc_id2": {
            "fn": "expression",
            "args": [
              {
                "name": "term",
                "value": {
                  "fn": "identifier",
                  "args": [
                    {
                      "name": "name",
                      "value": "module"
                    }
                  ]
                }
              },
              {
                "name": "rest",
                "value": [
                  "vpc",
                  "vpc_id",
                  "*",
                  0
                ]
              }
            ]
          }
        }
      ]
    }
  }
}
```
