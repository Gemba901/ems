# Page templates

ListPageTemplate, DetailPageTemplate, FormPageTemplate and DashboardPageTemplate compose the shared patterns. Import them directly from `@/components/templates/<Name>`.

See [frontend conventions and examples](../../../../docs/frontend/conventions.md#phase-3-page-templates). Live fixture examples are in `/dev/ui`. Templates handle layout and shared composition; callers own data fetching, permissions, validation and navigation. The app shell supplies page padding.
