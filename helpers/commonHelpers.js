const User = require('../models/User');

/**
 * Check if user is super admin
 * @param {Object} user - User object with role information
 * @returns {Boolean} - true if user is super admin
 */
function isSuperAdmin(user) {
    return user?.role?.name === 'super_admin';
}

/**
 * Check if user is organization admin
 * @param {Object} user - User object with role information
 * @returns {Boolean} - true if user is org admin
 */
function isOrgAdmin(user) {
    return user?.role?.name === 'org_admin';
}

/**
 * Check if user is admin (super admin or org admin)
 * @param {Object} user - User object with role information
 * @returns {Boolean} - true if user is any type of admin
 */
function isAdmin(user) {
    return isSuperAdmin(user) || isOrgAdmin(user);
}

/**
 * Verify if user has access to a record based on organization
 * @param {Object} user - Request user object
 * @param {Object} record - Record object with organization field
 * @returns {Boolean} - true if user has access, false otherwise
 */
function verifyOrganizationAccess(user, record) {
    // Super admin has access to all records
    if (isSuperAdmin(user)) {
        return true;
    }

    // Check if both user and record have organization
    if (!record.organization || !user.organization) {
        return false;
    }

    // Extract organization IDs
    const recordOrgId = typeof record.organization === 'object'
        ? record.organization._id?.toString() || record.organization.toString()
        : record.organization.toString();

    const userOrgId = user.organization.toString();

    return recordOrgId === userOrgId;
}

/**
 * Generic code generator for any model
 * @param {Object} Model - Mongoose model
 * @param {String} prefix - Code prefix (e.g., 'USR', 'ORG-', 'GRP')
 * @param {Number} length - Number of digits for padding
 * @param {Object} filter - Optional filter for scoping (e.g., { organization: orgId })
 * @returns {String} - Next code (e.g., USR0001, ORG-001, GRP0001)
 */
async function generateNextCode(Model, prefix, length = 4, filter = {}) {
    try {
        // Find the last record with the highest code
        const lastRecord = await Model.findOne(filter)
            .sort({ code: -1 })
            .select('code');

        let nextNumber = 1;

        if (lastRecord && lastRecord.code) {
            // Create regex to extract number from code
            // Escape special regex characters in prefix
            const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escapedPrefix}(\\d+)`);
            const match = lastRecord.code.match(regex);

            if (match) {
                nextNumber = parseInt(match[1], 10) + 1;
            }
        }

        // Format code with leading zeros
        const nextCode = `${prefix}${nextNumber.toString().padStart(length, '0')}`;
        return nextCode;
    } catch (error) {
        console.error('Error generating next code:', error);
        // Return default code on error
        return `${prefix}${'1'.padStart(length, '0')}`;
    }
}

/**
 * Apply organization filter to query based on user role
 * @param {Object} user - Request user object
 * @param {Object} filter - Existing filter object to modify
 * @param {String} organizationParam - Optional organization parameter from query
 * @returns {Object} - Modified filter object
 */
function applyOrganizationFilter(user, filter = {}, organizationParam = null) {
    // For non-Super Admin users, automatically filter by their organization
    if (!isSuperAdmin(user) && user.organization) {
        filter.organization = user.organization;
    } else if (organizationParam && organizationParam !== 'all') {
        // Super Admin can filter by specific organization via query param
        filter.organization = organizationParam;
    }

    return filter;
}

/**
 * Get role name from environment or use default
 * @param {String} roleType - 'super_admin' or 'org_admin'
 * @returns {String} - Role name
 */
function getRoleName(roleType) {
    const roleMap = {
        'super_admin': process.env.SUPER_ADMIN_ROLE || 'super_admin',
        'org_admin': process.env.ORG_ADMIN_ROLE || 'org_admin'
    };
    return roleMap[roleType] || roleType;
}

module.exports = {
    isSuperAdmin,
    isOrgAdmin,
    isAdmin,
    verifyOrganizationAccess,
    generateNextCode,
    applyOrganizationFilter,
    getRoleName
};
