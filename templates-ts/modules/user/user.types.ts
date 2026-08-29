/**
 * Domain types for the user module.
 *
 * Plain data — no ORM model instances cross the repository boundary, which is
 * what keeps services and controllers identical between the Sequelize and
 * Drizzle variants.
 */

export interface User {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Only repositories and the auth module ever see the hash. */
export interface UserWithSecret extends User {
  passwordHash: string;
}

/** A role as this module needs to report it. */
export interface AssignedRole {
  id: string;
  name: string;
}

export interface UserWithRoles extends User {
  roles: AssignedRole[];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  passwordHash?: string;
  isActive?: boolean;
}
