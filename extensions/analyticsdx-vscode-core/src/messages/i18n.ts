/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Conventions:
 * _message: is for unformatted text that will be shown as-is to
 * the user.
 * _text: is for text that will appear in the UI, possibly with
 * decorations, e.g., $(x) uses the https://octicons.github.com/ and should not
 * be localized
 *
 * If ommitted, we will assume _message.
 */
export const messages = Object.freeze({
  // commands/createApp.ts
  create_app_cmd_name_prompt: 'Enter app name',
  create_app_cmd_empty_name_message: 'Name must not be empty',
  create_app_cmd_message: 'Creating app from %s...',
  create_blank_app_cmd_message: 'Creating blank analytics app...',
  create_blank_app_cmd_tmp_file_error_text: 'Unable to write %s: %s',

  // commands/createDashboardLWC.ts
  create_dashboard_lwc_execution_name: 'SFDX: Create Analytics Dashboard LWC',
  create_dashboard_lwc_filename_prompt: 'Enter LWC filename',
  create_dashboard_lwc_overwrite_prompt: 'Overwrite existing LWC?',
  create_dashboard_lwc_template_prompt: 'Select LWC template...',
  create_dashboard_lwc_has_step: 'With attached step',
  create_dashboard_lwc_no_has_step: 'Without attached step',

  // commands/createTemplate.ts
  create_template_cmd_message: 'Creating template from analytics app...',
  create_template_cmd_no_templates_message: 'No un-templatized apps available in org.',
  create_template_cmd_placeholder_message: 'Select an analytics app to create the template from...',

  // commands/deleteApp.ts
  delete_app_cmd_message: 'Deleting analytics app...',
  delete_app_cmd_confirm_text: 'Delete the "%s" app?',
  delete_app_cmd_no_apps_message: 'No apps available in org to delete',
  delete_app_cmd_placeholder_message: 'Select an analytics app to delete...',

  // commands/deleteTemplate.ts
  delete_template_cmd_message: 'Deleting analytics template...',
  delete_template_cmd_confirm_text: 'Delete the "%s" template?',
  delete_template_cmd_no_templates_message: 'No templates available in org to delete',
  delete_template_cmd_placeholder_message: 'Select an analytics template to delete...',

  // commands/openStudio.js
  open_studio_cmd_message: 'Opening Analytics Studio...',
  open_studio_cmd_error: 'Unable to determine org url',
  open_data_manager_cmd_message: 'Opening Data Manager...',

  // commands/updateTemplate.ts
  update_template_cmd_message: 'Updating analytics template from associated app...',
  update_template_cmd_no_templates_message: 'No templates associated to an app available in org.',
  update_template_cmd_placeholder_message: 'Select an analytics template to update from its app...',
  update_template_from_app_cmd_message: 'Updating analytics template from app...',
  update_template_from_app_cmd_no_templates_message: 'No templates available in org.',
  update_template_from_app_cmd_placeholder_message: 'Select an analytics template to update...',
  update_template_from_app_cmd_no_apps_message: 'No apps created from the template available in the org.',
  update_template_from_app_cmd_current_app_details: 'Current Associated App',

  // commands/gatherers/appGatherer.ts
  app_gatherer_def_no_apps_message: 'No matching apps available in org.',
  app_gatherer_def_placeholder_message: 'Select an analytics app...',
  app_gatherer_def_fetch_message: 'Fetching analytics apps...',

  // commands/gatherers/outputDirGatherer.ts
  outputdir_gatherer_custom_dir_prompt: 'Select a custom directory...',
  outputdir_gatherer_dir_prompt: 'Select a directory...',

  // commands/gatherers/templateGatherer.ts
  template_gatherer_def_no_templates_message: 'No matching templates available in org.',
  template_gatherer_def_placeholder_message: 'Select an analytics template...',
  template_gatherer_def_fetch_message: 'Fetching analytics templates...',

  // utils/sfdx.ts
  missing_analytics_sfdx_plugin_message:
    'Analytics Salesforce CLI plugin is not installed. Some operations will not work without it.',
  outofdate_analytics_sfdx_plugin_message:
    'Your version of the Analytics Salesforce CLI plugin is older than the minimum required (%s). Some operations will not work.',
  disable_analytics_sfdx_check_button: 'Disable Check',
  install_analytics_sfdx_plugin_button: 'Install Plugin',
  install_analytics_sfdx_plugin_message: 'Installing Analytics Salesforce CLI plugin...',
  update_analytics_sfdx_plugin_button: 'Update Plugin',
  update_analytics_sfdx_plugin_message: 'Updating Analytics Salesforce CLI plugin...',

  ok: 'Ok'
});
