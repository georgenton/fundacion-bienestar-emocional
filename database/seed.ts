import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { loadConfig } from "@fbe/config";
import { prisma } from "@fbe/database";
import { capabilities, caseActions } from "@fbe/access-policy";
import { closeAuthPool, getAuth, getEnrollmentAuth } from "../apps/api/src/auth/auth.js";

const config = loadConfig();
if (!config.allowSyntheticSeed || config.appEnv === "production" || !config.syntheticDataOnly) {
  throw new Error("SYNTHETIC_SEED_NOT_ALLOWED");
}

const roles = [
  { code: "CLINICAL_COORDINATOR", description: "Coordinación por caso sin lectura clínica implícita", isStaff: true, isClinical: true },
  { code: "OPERATIONS_ADMIN", description: "Administración operativa sin acceso clínico", isStaff: true, isClinical: false },
  { code: "RECEPTION", description: "Recepción y vista operativa", isStaff: true, isClinical: false },
  { code: "PROFESSIONAL", description: "Profesional con acceso solo por asignación", isStaff: true, isClinical: true },
  { code: "SUPERVISOR", description: "Supervisor con acceso solo por asignación", isStaff: true, isClinical: true },
  { code: "INTERN", description: "Pasante con alcance temporal", isStaff: true, isClinical: true },
  { code: "PATIENT", description: "Paciente por identidad y participación", isStaff: false, isClinical: false },
  { code: "SUPPORT", description: "Soporte técnico sin lectura ordinaria", isStaff: true, isClinical: false },
] as const;

const capabilityDefinitions = [
  ["case:list:all", "Lista operativa mínima de casos"],
  ["case:overview:read", "Vista operativa sin contenido clínico"],
  ["account:disable", "Desactivar cuentas e invalidar sesiones"],
  ["account:invite", "Invitar y activar cuentas con rol explícito"],
  ["audit:read", "Consulta restringida de auditoría"],
  ["technical:diagnostics", "Diagnóstico técnico sin contenido de casos"],
  [capabilities.personManage, "Registro y búsqueda administrativa de personas"],
  [capabilities.caseManage, "Apertura y asignación administrativa de casos"],
  [capabilities.patientInvite, "Invitar a una persona registrada con rol paciente"],
  [capabilities.agendaManage, "Capacidad administrativa de agenda"],
  [capabilities.agendaConfigure, "Configuración sintética de agenda"],
  [capabilities.clinicalCoordinate, "Otorgar alcance clínico por caso"],
  [capabilities.practiceCoordinate, "Coordinar prácticas sintéticas"],
] as const;

const blockTwoCapabilities = [
  capabilities.personManage, capabilities.caseManage, capabilities.patientInvite,
  capabilities.agendaManage, capabilities.agendaConfigure,
];

const roleCapabilities: Record<string, string[]> = {
  OPERATIONS_ADMIN: ["case:list:all", "account:disable", "account:invite", "audit:read", ...blockTwoCapabilities],
  RECEPTION: ["case:list:all", "case:overview:read", ...blockTwoCapabilities],
  CLINICAL_COORDINATOR: [capabilities.clinicalCoordinate, capabilities.practiceCoordinate, capabilities.caseListAll, capabilities.caseOverviewRead],
  PROFESSIONAL: [],
  SUPERVISOR: [],
  INTERN: [],
  PATIENT: [],
  SUPPORT: ["technical:diagnostics"],
};

const actorDefinitions = [
  ["clinicalCoordinator", "Coordinación Clínica Sintética", "coordination@example.test", "CLINICAL_COORDINATOR"],
  ["operationsAdmin", "Administración Operativa Sintética", "operations.admin@example.test", "OPERATIONS_ADMIN"],
  ["reception", "Recepción Sintética", "reception@example.test", "RECEPTION"],
  ["professional", "Profesional Sintético", "professional@example.test", "PROFESSIONAL"],
  ["professionalB", "Profesional B Sintético", "professional-b@example.test", "PROFESSIONAL"],
  ["clinicalSupervisor", "Supervisor de Expediente Sintético", "clinical-supervisor@example.test", "SUPERVISOR"],
  ["supervisorB", "Supervisor B Sintético", "supervisor-b@example.test", "SUPERVISOR"],
  ["supervisor", "Supervisor Sintético", "supervisor@example.test", "SUPERVISOR"],
  ["intern", "Pasante Sintético", "intern@example.test", "INTERN"],
  ["clinicalPatient", "Paciente de Expediente Sintético", "clinical-patient@example.test", "PATIENT"],
  ["clinicalSupport", "Soporte de Expediente Sintético", "clinical-support@example.test", "SUPPORT"],
  ["patient", "Paciente Sintético", "patient@example.test", "PATIENT"],
  ["support", "Soporte Sintético", "support@example.test", "SUPPORT"],
] as const;

type LocalCredential = {
  email: string;
  password: string;
  accountId: string;
  personId: string;
  role: string;
  mfaRequired: boolean;
  totpSecret?: string;
  backupCodes?: string[];
};

function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function enrollMfa(email: string, password: string) {
  const auth = getAuth();
  const signIn = await auth.api.signInEmail({
    returnHeaders: true,
    body: { email, password, rememberMe: false },
    headers: new Headers({ host: "localhost:3001", origin: config.webOrigin }),
  });
  const sessionHeaders = new Headers({
    host: "localhost:3001",
    origin: config.webOrigin,
    cookie: cookieHeader(signIn.headers),
  });
  const enrollment = await auth.api.enableTwoFactor({
    returnHeaders: true,
    headers: sessionHeaders,
    body: { password, method: "totp" },
  });
  if (enrollment.response.method !== "totp") {
    throw new Error("EXPECTED_TOTP_ENROLLMENT");
  }
  const secret = new URL(enrollment.response.totpURI).searchParams.get("secret");
  if (!secret) throw new Error("MISSING_TOTP_SECRET");
  const code = await createOTP(base32.decode(secret)).totp();
  await auth.api.verifyTOTP({ headers: sessionHeaders, body: { code, trustDevice: false } });
  return { totpSecret: secret, backupCodes: enrollment.response.backupCodes };
}

async function run(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditEvent", "CaseAssignment", "CaseParticipant", "CareCase", "ServiceDefinition",
      "AccountInvitation", "AccountRole", "RoleCapability", "Capability", "Role", "UserAccount", "Person",
      "twoFactor", "session", "account", "verification", "user"
    RESTART IDENTITY CASCADE
  `);

  const createdCapabilities = new Map<string, string>();
  for (const [code, description] of capabilityDefinitions) {
    const capability = await prisma.capability.create({ data: { code, description } });
    createdCapabilities.set(code, capability.id);
  }

  const createdRoles = new Map<string, string>();
  for (const role of roles) {
    const created = await prisma.role.create({ data: role });
    createdRoles.set(role.code, created.id);
    for (const capabilityCode of roleCapabilities[role.code]) {
      await prisma.roleCapability.create({
        data: { roleId: created.id, capabilityId: createdCapabilities.get(capabilityCode)! },
      });
    }
  }

  const credentials: Record<string, LocalCredential> = {};
  for (const [key, displayName, email, roleCode] of actorDefinitions) {
    const password = `Syn!${randomBytes(18).toString("base64url")}`;
    const signedUp = await getEnrollmentAuth().api.signUpEmail({ body: { name: displayName, email, password } });
    const person = await prisma.person.create({ data: { displayName, contactEmail: email, synthetic: true } });
    const isStaff = roleCode !== "PATIENT";
    const userAccount = await prisma.userAccount.create({
      data: {
        authUserId: signedUp.user.id,
        personId: person.id,
        status: "ACTIVE",
        mfaRequired: isStaff,
        roles: { create: { roleId: createdRoles.get(roleCode)! } },
      },
    });
    credentials[key] = {
      email,
      password,
      accountId: userAccount.id,
      personId: person.id,
      role: roleCode,
      mfaRequired: isStaff,
      ...(isStaff ? await enrollMfa(email, password) : {}),
    };
  }

  const secondPatient = await prisma.person.create({
    data: { displayName: "Participante B Sintético", contactEmail: "participant-b@example.test", synthetic: true },
  });
  const caseA = await prisma.careCase.create({ data: { referenceCode: "SYN-CASE-A", synthetic: true } });
  const caseB = await prisma.careCase.create({ data: { referenceCode: "SYN-CASE-B", synthetic: true } });
  const started = new Date(Date.now() - 60_000);

  await prisma.caseParticipant.createMany({
    data: [
      { caseId: caseA.id, personId: credentials.patient!.personId, kind: "PATIENT", portalAccess: true, startsAt: started },
      { caseId: caseB.id, personId: secondPatient.id, kind: "PATIENT", portalAccess: false, startsAt: started },
    ],
  });
  await prisma.caseAssignment.createMany({
    data: [
      {
        caseId: caseA.id,
        accountId: credentials.professional!.accountId,
        function: "TREATING_PROFESSIONAL",
        allowedActions: [caseActions.overviewRead, caseActions.clinicalRead, caseActions.export],
        startsAt: started,
      },
      {
        caseId: caseB.id,
        accountId: credentials.supervisor!.accountId,
        function: "SUPERVISOR",
        allowedActions: [caseActions.overviewRead, caseActions.clinicalRead],
        startsAt: started,
      },
      {
        caseId: caseA.id,
        accountId: credentials.intern!.accountId,
        function: "INTERN",
        allowedActions: [caseActions.overviewRead],
        startsAt: started,
        endsAt: new Date(Date.now() + 86_400_000),
      },
    ],
  });

  const localDirectory = resolve(process.cwd(), ".local");
  await mkdir(localDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(localDirectory, "demo-credentials.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), synthetic: true, cases: { caseA: caseA.id, caseB: caseB.id }, actors: credentials }, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write("Fixtures sintéticos creados; credenciales locales guardadas con permisos 0600.\n");
}

try {
  await run();
} finally {
  await prisma.$disconnect();
  await closeAuthPool();
}
