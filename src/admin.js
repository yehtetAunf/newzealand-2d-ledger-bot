import {
  updateLicense,
  getUsers,
  approveGroup as approveGroupDb,
  banGroup as banGroupDb,
  unbanGroup as unbanGroupDb,
  archiveGroup as archiveGroupDb,
  restoreGroup as restoreGroupDb,
  deleteGroupPermanently as deleteGroupPermanentlyDb,
  getLicensedGroups
} from "./database.js";

const DEFAULT_ADMIN_ID = 8840114917;

export async function approveUser(db, chatId, plan, expiresAt) {
  return updateLicense(db, chatId, "approved", plan, expiresAt);
}

export async function banUser(db, chatId) {
  return updateLicense(db, chatId, "banned", "none", null);
}

export async function approveGroup(db, groupId, plan, expiresAt) {
  return approveGroupDb(db, groupId, plan, expiresAt);
}

export async function banGroup(db, groupId) {
  return banGroupDb(db, groupId);
}

export async function unbanGroup(db, groupId) {
  return unbanGroupDb(db, groupId);
}

export async function archiveGroup(db, groupId) {
  return archiveGroupDb(db, groupId);
}

export async function restoreGroup(db, groupId) {
  return restoreGroupDb(db, groupId);
}

export async function deleteGroupPermanently(db, groupId) {
  return deleteGroupPermanentlyDb(db, groupId);
}

export async function listUsers(db) {
  return getUsers(db);
}

export async function listGroups(db) {
  return getLicensedGroups(db);
}

export function isAdmin(userId, env) {
  const configuredId = Number(env.ADMIN_ID);
  const adminId = Number.isSafeInteger(configuredId) && configuredId > 0
    ? configuredId
    : DEFAULT_ADMIN_ID;
  return Number(userId) === adminId;
}
