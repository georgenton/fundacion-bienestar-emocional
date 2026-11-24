import { Injectable } from "@nestjs/common";
import { CaseAccessPolicy } from "@fbe/access-policy";
import { prisma } from "@fbe/database";

@Injectable()
export class AccessPolicyService extends CaseAccessPolicy {
  constructor() {
    super(prisma);
  }
}
