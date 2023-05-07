import { FastifyReply, FastifyRequest } from "fastify";
import { CrudController } from "../../../../core/platform/services/webserver/types";
import {
  PaginationQueryParameters,
  ResourceCreateResponse,
  ResourceDeleteResponse,
  ResourceGetResponse,
  ResourceListResponse,
  ResourceUpdateResponse,
} from "../../../../utils/types";
import Application, {
  ApplicationObject,
  PublicApplicationObject, TYPE,
} from "../../entities/application";
import {
  CrudException,
  ExecutionContext,
  Pagination,
} from "../../../../core/platform/framework/api/crud-service";
import _ from "lodash";
import { randomBytes } from "crypto";
import { ApplicationEventRequestBody } from "../types";
import { logger as log } from "../../../../core/platform/framework";
import { hasCompanyAdminLevel } from "../../../../utils/company";
import gr from "../../../global-resolver";
import config from "../../../../core/config";
import axios from "axios";
import PhpApplication, {DepreciatedDisplayConfiguration, TYPE as phpTYPE} from "../../entities/php-application-entity";

export const importDepreciatedDisplayFields = (
    application: Application,
    depreciatedDisplay: DepreciatedDisplayConfiguration,
): Application["display"] => {
  let display = application.display;

  if (!display?.twake) {
    display = display || { twake: {} };
    display.twake = display.twake || {};
  }

  display.twake.tab = depreciatedDisplay?.channel_tab
      ? { url: depreciatedDisplay?.channel_tab?.iframe } || true
      : undefined;

  display.twake.standalone = depreciatedDisplay?.app
      ? { url: depreciatedDisplay?.app?.iframe } || true
      : undefined;

  display.twake.configuration = [];
  if (depreciatedDisplay?.configuration?.can_configure_in_workspace)
    display.twake.configuration.push("global");
  if (depreciatedDisplay?.configuration?.can_configure_in_channel)
    display.twake.configuration.push("channel");

  display.twake.direct = depreciatedDisplay?.member_app
      ? { name: application.identity.name, icon: application.identity.icon } || true
      : undefined;

  if (depreciatedDisplay?.drive_module) {
    display.twake.files = {
      editor: undefined,
      actions: [],
    };

    display.twake.files.editor = {
      preview_url: depreciatedDisplay?.drive_module?.can_open_files?.preview_url,
      edition_url: depreciatedDisplay?.drive_module?.can_open_files?.url,
      extensions: [
        ...(depreciatedDisplay?.drive_module?.can_open_files?.main_ext || []),
        ...(depreciatedDisplay?.drive_module?.can_open_files?.other_ext || []),
      ],
      empty_files: (depreciatedDisplay?.drive_module?.can_create_files as any) || [],
    };
  }

  if (depreciatedDisplay?.messages_module) {
    display.twake.chat = {
      input:
          depreciatedDisplay?.messages_module?.in_plus ||
          depreciatedDisplay?.messages_module?.right_icon
              ? {
                icon: application.identity.icon,
              }
              : undefined,
      commands:
          (depreciatedDisplay?.messages_module
              ?.commands as Application["display"]["twake"]["chat"]["commands"]) || undefined,
      actions: depreciatedDisplay?.messages_module?.action
          ? [
            {
              name: depreciatedDisplay?.messages_module?.action.description,
              id: "default",
            },
          ]
          : undefined,
    };
  }

  return display;
};

const importDepreciatedFields = (application: PhpApplication): Application => {
  const newApplication = new Application();

  newApplication.id = application.id;
  newApplication.company_id = application.group_id;
  newApplication.is_default = application.is_default;

  if (!newApplication.identity?.name) {
    newApplication.identity = {
      code:
          application.depreciated_simple_name ||
          (application.depreciated_name || "").toLocaleLowerCase(),
      name: application.depreciated_name,
      icon: application.depreciated_icon_url,
      description: application.depreciated_description,
      website: "http://twake.app/",
      categories: [],
      compatibility: ["twake"],
    };
  }

  if (newApplication.publication?.published === undefined) {
    newApplication.publication = newApplication.publication || {
      published: false,
      requested: false,
    };
    newApplication.publication.published = application.depreciated_is_available_to_public;
    newApplication.publication.requested =
        application.depreciated_public && !application.depreciated_twake_team_validation;
  }

  if (!newApplication.stats?.version) {
    newApplication.stats = newApplication.stats || {
      created_at: null,
      updated_at: null,
      version: null,
    };
    newApplication.stats.version = 1;
    newApplication.stats.created_at = Date.now();
    newApplication.stats.updated_at = Date.now();
  }

  if (!newApplication.api?.private_key) {
    newApplication.api = newApplication.api || {
      hooks_url: null,
      allowed_ips: null,
      private_key: null,
    };
    newApplication.api.hooks_url = application.depreciated_api_events_url;
    newApplication.api.allowed_ips = application.depreciated_api_allowed_ip;
    newApplication.api.private_key = application.depreciated_api_private_key;
  }

  if (newApplication.access?.write === undefined) {
    newApplication.access = newApplication.access || {
      read: null,
      write: null,
      delete: null,
      hooks: null,
    };
    try {
      newApplication.access.write = JSON.parse(application.depreciated_capabilities || "[]") || [];
      newApplication.access.delete = JSON.parse(application.depreciated_capabilities || "[]") || [];
    } catch (e) {
      newApplication.access.write = [];
      newApplication.access.delete = [];
    }
    try {
      newApplication.access.read = JSON.parse(application.depreciated_privileges || "[]") || [];
    } catch (e) {
      newApplication.access.read = [];
    }
    try {
      newApplication.access.hooks = JSON.parse(application.depreciated_hooks || "[]") || [];
    } catch (e) {
      newApplication.access.hooks = [];
    }
  }

  newApplication.display = importDepreciatedDisplayFields(
      newApplication,
      JSON.parse(application.depreciated_display_configuration),
  );

  return newApplication;
};

export class ApplicationController
  implements
    CrudController<
      ResourceGetResponse<PublicApplicationObject>,
      ResourceUpdateResponse<PublicApplicationObject>,
      ResourceListResponse<PublicApplicationObject>,
      ResourceDeleteResponse
    >
{
  async get(
    request: FastifyRequest<{ Params: { application_id: string } }>,
  ): Promise<ResourceGetResponse<ApplicationObject | PublicApplicationObject>> {
    const context = getExecutionContext(request);

    const entity = await gr.services.applications.marketplaceApps.get(
      {
        id: request.params.application_id,
      },
      context,
    );

    const companyUser = await gr.services.companies.getCompanyUser(
      { id: entity.company_id },
      { id: context.user.id },
    );

    const isAdmin = companyUser && companyUser.role == "admin";

    return {
      resource: isAdmin ? entity.getApplicationObject() : entity.getPublicObject(),
    };
  }

  async list(
    request: FastifyRequest<{
      Querystring: PaginationQueryParameters & { search: string };
    }>,
  ): Promise<ResourceListResponse<PublicApplicationObject>> {
    const entities = await gr.services.applications.marketplaceApps.list(new Pagination(), {
      search: request.query.search,
    });
    return {
      resources: entities.getEntities(),
      next_page_token: entities.nextPage.page_token,
    };
  }

  async save(
    request: FastifyRequest<{
      Params: { application_id: string };
      Body: { resource: Application };
    }>,
    _reply: FastifyReply,
  ): Promise<ResourceGetResponse<ApplicationObject | PublicApplicationObject>> {
    const context = getExecutionContext(request);

    try {
      const app = request.body.resource;
      const now = new Date().getTime();
      const pluginsEndpoint = config.get("plugins.api");

      let entity: Application;

      if (request.params.application_id) {
        entity = await gr.services.applications.marketplaceApps.get(
          {
            id: request.params.application_id,
          },
          context,
        );

        if (!entity) {
          throw CrudException.notFound("Application not found");
        }

        entity.publication.requested = app.publication.requested;
        if (app.publication.requested === false) {
          entity.publication.published = false;
        }

        if (entity.publication.published) {
          if (
            !_.isEqual(
              _.pick(entity, "identity", "api", "access", "display"),
              _.pick(app, "identity", "api", "access", "display"),
            )
          ) {
            throw CrudException.badRequest(
              "You can't update applications details while it published",
            );
          }
        }

        entity.identity = app.identity;
        entity.api.hooks_url = app.api.hooks_url;
        entity.api.allowed_ips = app.api.allowed_ips;
        entity.access = app.access;
        entity.display = app.display;

        entity.stats.updated_at = now;
        entity.stats.version++;

        const res = await gr.services.applications.marketplaceApps.save(entity);
        entity = res.entity;
      } else {
        // INSERT

        app.is_default = false;
        app.publication.published = false;
        app.api.private_key = randomBytes(32).toString("base64");

        app.stats = {
          created_at: now,
          updated_at: now,
          version: 0,
        };

        const res = await gr.services.applications.marketplaceApps.save(app);
        entity = res.entity;
      }

      // SYNC PLUGINS
      if (app.identity.repository) {
        try {
          axios
            .post(
              `${pluginsEndpoint}/add`,
              {
                gitRepo: app.identity.repository,
                pluginId: entity.getApplicationObject().id,
                pluginSecret: entity.getApplicationObject().api.private_key,
              },
              {
                headers: {
                  "Content-Type": "application/json",
                },
              },
            )
            .then(response => {
              log.info(response.data);
            })
            .catch(error => {
              log.error(error);
            });
        } catch (error) {
          console.error(error);
        }
      }

      return {
        resource: entity.getApplicationObject(),
      };
    } catch (e) {
      log.error(e);
      throw e;
    }
  }

  async migrate(
    request: FastifyRequest<{
      Params: { application_id: string };
      Body: { resource: Application };
    }>,
    _reply: FastifyReply,
  ): Promise<ResourceGetResponse<ApplicationObject[] | PublicApplicationObject[]>> {
    try {
      const phpRepository = await gr.database.getRepository<PhpApplication>(phpTYPE, PhpApplication);
      const repository = await gr.database.getRepository<Application>(TYPE, Application);

      let page: Pagination = { limitStr: "100" };
      let entities: Application[] = [];
      let replaceExisting = true;

      do {
        const applicationListResult = await phpRepository.find({}, { pagination: page }, undefined);
        page = applicationListResult.nextPage as Pagination;

        for (const application of applicationListResult.getEntities()) {
          if (
              !(await repository.findOne(
                  {
                    id: application.id,
                  },
                  {},
                  undefined,
              )) ||
              replaceExisting
          ) {
            const newApplication = importDepreciatedFields(application);
            const res = await gr.services.applications.marketplaceApps.save(newApplication);
            entities.push(res.entity);
          }
        }
      } while (page.page_token);

      return {
        resource: entities,
      };
    } catch (e) {
      log.error(e);
      throw e;
    }
  }

  async delete(
    request: FastifyRequest<{ Params: { application_id: string } }>,
    reply: FastifyReply,
  ): Promise<ResourceDeleteResponse> {
    const context = getExecutionContext(request);

    const application = await gr.services.applications.marketplaceApps.get(
      {
        id: request.params.application_id,
      },
      context,
    );

    const compUser = await gr.services.companies.getCompanyUser(
      { id: application.company_id },
      { id: context.user.id },
    );
    if (!compUser || !hasCompanyAdminLevel(compUser.role)) {
      throw CrudException.forbidden("You don't have the rights to delete this application");
    }

    const deleteResult = await gr.services.applications.marketplaceApps.delete(
      {
        id: request.params.application_id,
      },
      context,
    );

    if (deleteResult.deleted) {
      reply.code(204);

      return {
        status: "success",
      };
    }

    return {
      status: "error",
    };
  }

  async event(
    request: FastifyRequest<{
      Body: ApplicationEventRequestBody;
      Params: { application_id: string };
    }>,
    _reply: FastifyReply,
  ): Promise<ResourceCreateResponse<any>> {
    const context = getExecutionContext(request);

    const content = request.body.data;

    const applicationEntity = await gr.services.applications.marketplaceApps.get(
      {
        id: request.params.application_id,
      },
      context,
    );

    if (!applicationEntity) {
      throw CrudException.notFound("Application not found");
    }

    const companyUser = gr.services.companies.getCompanyUser(
      { id: request.body.company_id },
      { id: context.user.id },
    );

    if (!companyUser) {
      throw CrudException.badRequest(
        "You cannot send event to an application from another company",
      );
    }

    const applicationInCompany = await gr.services.applications.companyApps.get({
      company_id: request.body.company_id,
      application_id: request.params.application_id,
      id: undefined,
    });

    if (!applicationInCompany) {
      throw CrudException.badRequest("Application isn't installed in this company");
    }

    const hookResponse = await gr.services.applications.hooks.notifyApp(
      request.params.application_id,
      request.body.connection_id,
      context.user.id,
      request.body.type,
      request.body.name,
      content,
      request.body.company_id,
      request.body.workspace_id,
      context,
    );

    return {
      resource: hookResponse,
    };
  }
}

function getExecutionContext(request: FastifyRequest): ExecutionContext {
  return {
    user: request.currentUser,
    url: request.url,
    method: request.routerMethod,
    transport: "http",
  };
}
