import {
  updateLicense,
  getUsers,
  approveGroup as approveGroupDb,
  banGroup as banGroupDb,
  unbanGroup as unbanGroupDb,
  getLicensedGroups
} from "./database.js";

const DEFAULT_ADMIN_ID = 8840114917;

export async function approveUser(
  db,
  chatId,
  plan,
  expiresAt
) {
  return updateLicense(
    db,
    chatId,
    "approved",
    plan,
    expiresAt
  );
}

export async function banUser(
  db,
  chatId
) {
  return updateLicense(
    db,
    chatId,
    "banned",
    "none",
    null
  );
}

export async function approveGroup(
  db,
  groupId,
  plan,
  expiresAt
) {
  return approveGroupDb(
    db,
    groupId,
    plan,
    expiresAt
  );
}

export async function banGroup(
  db,
  groupId
) {
  return banGroupDb(
    db,
    groupId
  );
}

export async function unbanGroup(
  db,
  groupId
) {
  return unbanGroupDb(
    db,
    groupId
  );
}

export async function listUsers(db) {
  return getUsers(db);
}

export async function listGroups(db) {
  return getLicensedGroups(db);
}

export function isAdmin(
  chatId,
  env
) {
  const configuredId =
    Number(env.ADMIN_ID);

  const adminId =
    Number.isSafeInteger(configuredId) &&
    configuredId > 0
      ? configuredId
      : DEFAULT_ADMIN_ID;

  return Number(chatId) === adminId;
}
