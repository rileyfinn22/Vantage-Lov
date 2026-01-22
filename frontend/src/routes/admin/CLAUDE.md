You aer in the admin components! You should keep a few things in mind.

You should not EVER be calling react query endpoints directly. ALWAYS use refine endpoints, they are wrappers around react query, so pass `queryOptions` to the getters if you need to pass a refetch or something.
The refine endpoints will provide a crud interface to things. Use that WHENEVER possible.

use context7 to look up retfine's documentation if you need
