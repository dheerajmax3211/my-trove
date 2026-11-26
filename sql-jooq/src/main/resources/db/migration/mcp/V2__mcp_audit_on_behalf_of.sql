-- mcp-server: an API key acts for the person who created it (brief 86). principal_id stays the key's app
-- ("app:<appId>"); on_behalf_of is that person's internal user id, so an audit row reads "app X acting for user Y".
-- Null for a person calling with their own sign-in token. Plain DDL only (readable by the jOOQ DDL parser).
alter table mcp.tool_calls add column on_behalf_of varchar(160);

create index tool_calls_on_behalf_of_idx on mcp.tool_calls (on_behalf_of, called_at);
