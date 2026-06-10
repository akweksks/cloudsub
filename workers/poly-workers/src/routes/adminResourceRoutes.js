import airportHandler from "../handlers/airportHandler.js";
import commonHandler from "../handlers/commonHandler.js";
import groupHandler from "../handlers/groupHandlers.js";
import ruleHandler from "../handlers/ruleHandler.js";
import selfNodeHandler from "../handlers/selfNodeHandler.js";

export function registerAdminResourceRoutes(app) {
  app.post("/api/admin/airports/add", (c) => airportHandler.createAirport(c.env, c.req.raw));
  app.get("/api/admin/airports/all", (c) => airportHandler.getAllAirports(c.env));
  app.get("/api/admin/airports/single", (c) => airportHandler.getAirportById(c.env, c.req.query("id")));
  app.post("/api/admin/airports/update", (c) => airportHandler.updateAirport(c.env, c.req.raw));
  app.get("/api/admin/airports/del", (c) => airportHandler.deleteAirport(c.env, c.req.query("id")));
  app.get("/api/admin/airports/check", (c) => airportHandler.checkAirport(c.env, c.req.query("id")));
  app.get("/api/admin/airports/checkAll", (c) => airportHandler.checkAllAirports(c.env));
  app.get("/api/admin/airports/nodes", (c) => airportHandler.getAirportNodes(c.env, c.req.query("id")));

  app.post("/api/admin/rules/add", (c) => ruleHandler.createRule(c.req.raw, c.env));
  app.get("/api/admin/rules/page", (c) => ruleHandler.getRulesPage(c.env, c.req.query("type"), c.req.query("pageNum"), c.req.query("pageSize"), c.req.query("keyWord")));
  app.get("/api/admin/rules/type", (c) => ruleHandler.getAllRulesByType(c.env, c.req.query("type")));
  app.get("/api/admin/rules/all", (c) => ruleHandler.getAllRules(c.env));
  app.get("/api/admin/rules/single", (c) => ruleHandler.getRuleById(c.env, c.req.query("id")));
  app.post("/api/admin/rules/update", (c) => ruleHandler.updateRule(c.req.raw, c.env));
  app.post("/api/admin/rules/import", (c) => ruleHandler.importRule(c.req.raw, c.env));
  app.get("/api/admin/rules/del", (c) => ruleHandler.deleteRule(c.env, c.req.query("id")));
  app.get("/api/admin/rules/deleteAll", (c) => ruleHandler.deleteAll(c.env));

  app.post("/api/admin/groups/add", (c) => groupHandler.addGroup(c.req.raw, c.env));
  app.get("/api/admin/groups/type", (c) => groupHandler.getGroupsByType(c.env, c.req.query("type")));
  app.get("/api/admin/groups/all", (c) => groupHandler.getAllGroups(c.env));
  app.get("/api/admin/groups/single", (c) => groupHandler.getGroupById(c.env, c.req.query("id")));
  app.post("/api/admin/groups/update", (c) => groupHandler.editGroup(c.req.raw, c.env));
  app.get("/api/admin/groups/del", (c) => groupHandler.deleteGroup(c.env, c.req.query("id")));

  app.get("/api/admin/subscription/source", (c) => commonHandler.getSub(c.env));
  app.get("/api/admin/subscription/generate", (c) => commonHandler.subgenerate(c.env));

  app.get("/api/admin/config", (c) => commonHandler.getConfig(c.env));
  app.get("/api/admin/config/reset", (c) => commonHandler.resetConfig(c.env));
  app.post("/api/admin/config/update", (c) => commonHandler.updateConfig(c.env, c.req.raw));
  app.post("/api/admin/user/reset-token", (c) => commonHandler.setToken(c.env, c.req.raw));

  app.post("/api/admin/self-nodes/add", (c) => selfNodeHandler.addNode(c.req.raw, c.env));
  app.get("/api/admin/self-nodes/all", (c) => selfNodeHandler.getAllNodes(c.env));
  app.get("/api/admin/self-nodes/single", (c) => selfNodeHandler.getNodeById(c.env, c.req.query("id")));
  app.post("/api/admin/self-nodes/update", (c) => selfNodeHandler.editNode(c.req.raw, c.env));
  app.get("/api/admin/self-nodes/del", (c) => selfNodeHandler.deleteNode(c.env, c.req.query("id")));
}
