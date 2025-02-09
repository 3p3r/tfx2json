# tfx2json

Convert Terraform / OpenTofu templates (.tf) to JSON for saner ops. This project
also supports decoding HCL expressions into a parseable JSON format.

This is currently done in two passes:

- pass 1: parse the HCL into a general JSON structure using hcl2json WASM.
- pass 2: expand expressions left by pass 1 into JSON with tree-sitter-hcl.

## Usage

Library is published as a UMD module for NodeJS currently.

```sh
npm install tfx2json
```

```js
const { tfx2json } = require('tfx2json');
const fs = require('fs');

const hcl = tfx2json(fs.readFileSync('sample.tf'));
console.log(JSON.stringify(hcl, null, 2));
```

## Build

Go 1.22+ and [TinyGO](https://tinygo.org) are required for building.

- make sure git submodules are up to date, `git`, `go` and `tinygo` are in $PATH
- run `npm install`
- run `npm run build`
- run `npm run bundle`
- put something in `sample.tf`
- run `node -e 'var r=require;r("./dist").tfx2json(r("fs").readFileSync("sample.tf")).then(hcl=>console.log(JSON.stringify(hcl,null,2)))`

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
    from_port3 = -123
    from_port2 = 22 + 123
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
              "from_port2": {
                "fn": "add",
                "args": [
                  {
                    "name": "lhs",
                    "value": 22
                  },
                  {
                    "name": "rhs",
                    "value": 123
                  }
                ]
              },
              "from_port3": -123,
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
                "value": 1
              },
              {
                "name": "false",
                "value": 0
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
