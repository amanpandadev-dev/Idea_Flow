// FIX FOR sessionContextManager.js
// Replace lines 118-160 with this code:

// Index by business group (DATABASE FIELD: business_group)
if (meta.business_group || meta.businessGroup) {
    const bg = (meta.business_group || meta.businessGroup).toLowerCase();
    if (!this.indexes.byBusinessGroup.has(bg)) {
        this.indexes.byBusinessGroup.set(bg, new Set());
    }
    this.indexes.byBusinessGroup.get(bg).add(id);
}

// Index by domain (USE business_group as domain)
if (meta.business_group || meta.domain) {
    const domain = (meta.business_group || meta.domain).toLowerCase();
    if (!this.indexes.byDomain.has(domain)) {
        this.indexes.byDomain.set(domain, new Set());
    }
    this.indexes.byDomain.get(domain).add(id);
}

// Index by theme (if available)
if (meta.theme || meta.aiTheme) {
    const theme = (meta.theme || meta.aiTheme).toLowerCase();
    if (!this.indexes.byTheme.has(theme)) {
        this.indexes.byTheme.set(theme, new Set());
    }
    this.indexes.byTheme.get(theme).add(id);
}

// Index by status
if (meta.implementation_status || meta.status) {
    const status = (meta.implementation_status || meta.status).toLowerCase();
    if (!this.indexes.byStatus.has(status)) {
        this.indexes.byStatus.set(status, new Set());
    }
    this.indexes.byStatus.get(status).add(id);
}
