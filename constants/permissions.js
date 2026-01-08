/**
 * System-wide permission registry
 * Categories and their associated permissions with labels for UI display
 */
const SYSTEM_PERMISSIONS = [
    {
        category: 'Dashboard',
        permissions: [
            { id: 'dashboard.read', label: 'View Dashboard' }
        ]
    },
    {
        category: 'Organizations',
        isAdminOnly: true,
        permissions: [
            { id: 'organizations.create', label: 'Create Organizations' },
            { id: 'organizations.read', label: 'View Organizations' },
            { id: 'organizations.update', label: 'Update Organizations' },
            { id: 'organizations.delete', label: 'Delete Organizations' }
        ]
    },
    {
        category: 'Users',
        permissions: [
            { id: 'users.create', label: 'Create Users' },
            { id: 'users.read', label: 'View Users' },
            { id: 'users.update', label: 'Update Users' },
            { id: 'users.delete', label: 'Delete Users' }
        ]
    },
    {
        category: 'Groups',
        permissions: [
            { id: 'groups.create', label: 'Create Groups' },
            { id: 'groups.read', label: 'View Groups' },
            { id: 'groups.update', label: 'Update Groups' },
            { id: 'groups.delete', label: 'Delete Groups' }
        ]
    },
    {
        category: 'Goals',
        permissions: [
            { id: 'goals.create', label: 'Create Goals' },
            { id: 'goals.read', label: 'View Goals' },
            { id: 'goals.update', label: 'Update Goals' },
            { id: 'goals.delete', label: 'Delete Goals' }
        ]
    },
    {
        category: 'Goal Entries',
        permissions: [
            { id: 'goal-entries.create', label: 'Create Entries' },
            { id: 'goal-entries.read', label: 'View Entries' },
            { id: 'goal-entries.update', label: 'Update Entries' },
            { id: 'goal-entries.delete', label: 'Delete Entries' }
        ]
    },
    {
        category: 'Roles',
        permissions: [
            { id: 'roles.create', label: 'Create Roles' },
            { id: 'roles.read', label: 'View Roles' },
            { id: 'roles.update', label: 'Update Roles' },
            { id: 'roles.delete', label: 'Delete Roles' }
        ]
    },
    {
        category: 'Audit Logs',
        permissions: [
            { id: 'audit-logs.read', label: 'View Logs' },
            { id: 'audit-logs.export', label: 'Export Logs' }
        ]
    }
];

/**
 * Get a flat list of all permission IDs
 */
const getAllPermissionIds = () => {
    return SYSTEM_PERMISSIONS.reduce((ids, category) => {
        return ids.concat(category.permissions.map(p => p.id));
    }, []);
};

/**
 * Get default permissions for an organization admin
 */
const getOrgAdminPermissions = () => {
    // Org Admin gets most things except system-level organization management
    const excludedPrefixes = ['organizations.'];
    return getAllPermissionIds().filter(id => !excludedPrefixes.some(prefix => id.startsWith(prefix)));
};

module.exports = {
    SYSTEM_PERMISSIONS,
    getAllPermissionIds,
    getOrgAdminPermissions
};
