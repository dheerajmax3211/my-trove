package com.personalplatform.platform;

import org.jooq.DSLContext;

/**
 * Empties the developer-platform tables in dependency order. Every developer test calls this first, so a row a previous
 * test left behind cannot break another test's cleanup through a foreign key.
 */
final class DeveloperTables {

    private DeveloperTables() {}

    static void wipe(DSLContext dsl) {
        dsl.execute("delete from platform.webhook_deliveries");
        dsl.execute("delete from platform.webhook_received_events");
        dsl.execute("delete from platform.webhook_endpoint_events");
        dsl.execute("delete from platform.webhook_endpoints");
        dsl.execute("delete from platform.api_key_scopes");
        dsl.execute("delete from platform.api_keys");
        dsl.execute("delete from platform.developer_app_redirect_uris");
        dsl.execute("delete from platform.developer_apps");
    }
}
