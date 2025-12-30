const User = require('../models/User');

/**
 * Validate group members (users and managers)
 * @param {Array} users - Array of user IDs
 * @param {Array} managers - Array of manager IDs
 * @param {String} organizationId - Organization ID to validate against
 * @returns {Object} - { valid: boolean, message: string }
 */
async function validateGroupMembers(users, managers, organizationId) {
    // Validate at least one user is required
    if (!users || users.length === 0) {
        return {
            valid: false,
            message: 'At least one user is required for the group'
        };
    }

    // Validate at least one manager is required
    if (!managers || managers.length === 0) {
        return {
            valid: false,
            message: 'At least one manager is required for the group'
        };
    }

    // Validate that all users belong to the same organization
    if (users.length > 0) {
        const userDocs = await User.find({ _id: { $in: users } }).select('organization');
        const invalidUsers = userDocs.filter(u => u.organization.toString() !== organizationId.toString());
        if (invalidUsers.length > 0) {
            return {
                valid: false,
                message: 'All users must belong to the same organization'
            };
        }
    }

    // Validate that all managers belong to the same organization
    if (managers.length > 0) {
        const managerDocs = await User.find({ _id: { $in: managers } }).select('organization');
        const invalidManagers = managerDocs.filter(m => m.organization.toString() !== organizationId.toString());
        if (invalidManagers.length > 0) {
            return {
                valid: false,
                message: 'All managers must belong to the same organization'
            };
        }
    }

    return { valid: true };
}

/**
 * Verify if user has access to a group based on organization
 * @param {Object} user - Request user object
 * @param {Object} group - Group object with organization field
 * @returns {Boolean} - true if user has access, false otherwise
 */
function verifyGroupAccess(user, group) {
    const userRoleName = user.role?.name;

    // Super admin has access to all groups
    if (userRoleName === 'super_admin') {
        return true;
    }

    // Other users can only access groups from their organization
    if (group.organization && user.organization) {
        const groupOrgId = typeof group.organization === 'object'
            ? group.organization._id.toString()
            : group.organization.toString();
        const userOrgId = user.organization.toString();

        return groupOrgId === userOrgId;
    }

    return false;
}

/**
 * Generate next group code for an organization
 * @param {String} organizationId - Organization ID
 * @param {Object} GroupModel - Group model
 * @returns {String} - Next group code (e.g., GMONEY-GRP001)
 */
async function generateNextGroupCode(organizationId, GroupModel) {
    const Organization = require('../models/Organization');

    // Get organization to fetch its code
    const organization = await Organization.findById(organizationId).select('code');
    if (!organization || !organization.code) {
        throw new Error('Organization not found or organization code is missing');
    }

    const orgCode = organization.code;
    const groupPrefix = process.env.GROUP_CODE_PREFIX || 'GRP';
    const codeLength = parseInt(process.env.GROUP_CODE_LENGTH) || 3;

    // Find the latest group code for this organization
    // Pattern: ORG_CODE-GRP###
    const codePattern = `${orgCode}-${groupPrefix}`;
    const lastGroup = await GroupModel.findOne({
        organization: organizationId,
        code: { $regex: `^${codePattern}` }
    })
        .sort({ code: -1 })
        .select('code');

    let nextNumber = 1;
    if (lastGroup && lastGroup.code) {
        // Extract number from code (e.g., "GMONEY-GRP001" -> 1)
        const regex = new RegExp(`${codePattern}(\\d+)`);
        const match = lastGroup.code.match(regex);
        if (match) {
            nextNumber = parseInt(match[1]) + 1;
        }
    }

    // Format code with leading zeros (GMONEY-GRP001, GMONEY-GRP002, etc.)
    const nextCode = `${codePattern}${nextNumber.toString().padStart(codeLength, '0')}`;
    return nextCode;
}

/**
 * Check if user is super admin
 * @param {Object} user - User object
 * @returns {Boolean} - true if super admin
 */
function isSuperAdmin(user) {
    return user.role?.name === 'super_admin';
}

module.exports = {
    validateGroupMembers,
    verifyGroupAccess,
    generateNextGroupCode,
    isSuperAdmin
};
