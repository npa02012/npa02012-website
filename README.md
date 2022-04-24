# Initial Manual Setup

#### AWS Account Setup
* AWS Account with MFA on root user.
* Login as root user.

#### EC2 Developer Desktop Setup
* IAM Role
	* Trusted Entity Type: AWS Service
	* Use case: EC2
	* Policies: AdministratorAccess
	* Name: ***-admin-manual
* Key Pair
	* Name: ***-manual
	* Key pair type: RSA
	* Private key file format: .pem
	* Place private .pem file into ./secrets/
* Security Group:
	* Name: ***-manual
	* Description: SSH access to development desktop
	* VPC: Default VPC
	* Inbound Rule: "My IP" with Port Range 22
	* Outbound Rule: All traffic (default)
* EC2 Dashboard (us-west-2)
	* Launch Instances
	* AMI: *Amazon Linux 2 AMI (HVM) - Kernel 5.10, SSD Volume Type - ami-0c02fb55956c7d316 (64-bit x86)*
	* Instance Type: t2.medium
	* Attach ***-admin-manual IAM Role, Key Pair, and Security Group to the instance.
	* 8GB General Purpose Storage
	* Tags: Name --> ***-dev-manual

At this point, the below should work for connecting to the EC2 instance:

```bash
ssh -i ./secrets/***-manual.pem \
ec2-user@***.us-west-2.compute.amazonaws.com

# If you receive a 
#   "WARNING: UNPROTECTED PRIVATE KEY FILE!"
#   message. Run the command below and try again.
chmod 400 ./***-manual.pem
```

* Add an SSH Key on the EC2 Instance so that it can access this repository.

Custom software on EC2:  

```bash
# Update yum
sudo yum update -y

# Install git
sudo yum install git -y

# Install NodeJS and npm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm install node
node -e "console.log('Running Node.js ' + process.version)"

# Install aws-cdk
npm install -g aws-cdk

# Other npm
npm install
```

#### Website Setup
* Route53 **Register Domain** - *npa02012.com*.
