/**
 * deployment-gates.js
 * Controls all deployment decisions with human approval gates and full audit trail.
 * Zero npm dependencies — pure Node.js
 * Version: 1.0.0
 */

'use strict';

const _auditLog = [];
function nowISO() { return new Date().toISOString(); }
function pushAudit(entry) { _auditLog.push({ ...entry, _logged: nowISO() }); }

/**
 * Check if staging is required before production deployment.
 */
function checkStagingRequired(config) {
  return config?.deploymentGates?.stagingRequired === true;
}

/**
 * Create an approval request object to store in CRM.
 */
function createApprovalRequest(leadScore) {
  const request = {
    requestId: 'apr_' + leadScore.leadId + '_' + Date.now(),
    leadId: leadScore.leadId, requestedAt: nowISO(), requestedBy: 'lead-scoring-engine',
    tier: leadScore.tier.name, score: leadScore.scores.total, reasoning: leadScore.reasoning,
    signals: leadScore.signals, status: 'pending',
    decidedAt: null, decidedBy: null, decision: null, decisionReason: null
  };
  pushAudit({ event: 'approval_requested', leadId: leadScore.leadId, timestamp: nowISO(), requestedBy: 'lead-scoring-engine', tier: leadScore.tier.name, score: leadScore.scores.total, reasoning: leadScore.reasoning });
  return request;
}

/**
 * Record a human approval decision and create audit entry.
 */
function recordApproval(approvalRequest, approvedBy, decision, reason) {
  if (!reason || reason.trim().length < 3) throw new Error('Approval decision requires a non-empty reason');
  const isOverride = decision === 'escalate';
  const auditRecord = { event: 'approval_decision', leadId: approvalRequest.leadId, requestId: approvalRequest.requestId, timestamp: nowISO(), decidedBy: approvedBy, decision, reason, overrideFlag: isOverride };
  pushAudit(auditRecord);
  approvalRequest.status = decision; approvalRequest.decidedAt = nowISO();
  approvalRequest.decidedBy = approvedBy; approvalRequest.decision = decision;
  approvalRequest.decisionReason = reason;
  return auditRecord;
}

/**
 * Determine if a lead can be deployed based on mode and approval status.
 * Modes: per_lead | auto_hot_daily_summary | weekly_batch | scoring_only
 */
function checkDeploymentApproval(leadScore, mode, approvalRecord) {
  const tier = leadScore.tier.name;
  const score = leadScore.scores.total;

  if (mode === 'scoring_only') return { canDeploy: false, reason: 'Mode is scoring_only — deployment disabled. Score logged only.', requiresAction: null };

  if (mode === 'per_lead') {
    if (!approvalRecord) {
      pushAudit({ event: 'deployment_blocked', leadId: leadScore.leadId, timestamp: nowISO(), reason: 'No approval record', score, tier });
      return { canDeploy: false, reason: 'per_lead mode requires an approval record. Call createApprovalRequest() first.', requiresAction: 'create_approval_request' };
    }
    if (approvalRecord.decision !== 'approve') return { canDeploy: false, reason: 'Approval status is "' + (approvalRecord.decision ?? 'pending') + '" — not yet approved.', requiresAction: approvalRecord.decision === 'reject' ? null : 'await_approval' };
    pushAudit({ event: 'deployment_approved', leadId: leadScore.leadId, timestamp: nowISO(), approvedBy: approvalRecord.decidedBy, mode });
    return { canDeploy: true, reason: 'Explicitly approved via per_lead mode.', requiresAction: null };
  }

  if (mode === 'auto_hot_daily_summary') {
    if (tier === 'hot') {
      pushAudit({ event: 'deployment_auto_approved', leadId: leadScore.leadId, timestamp: nowISO(), tier, mode });
      return { canDeploy: true, reason: 'HOT lead (score ' + score + ') auto-approved under auto_hot_daily_summary mode.', requiresAction: null };
    }
    return { canDeploy: false, reason: tier.toUpperCase() + ' lead queued for daily summary review.', requiresAction: 'queued_daily_summary' };
  }

  if (mode === 'weekly_batch') {
    pushAudit({ event: 'deployment_queued', leadId: leadScore.leadId, timestamp: nowISO(), tier, mode });
    return { canDeploy: false, reason: 'Lead queued for Monday weekly batch review.', requiresAction: 'queued_weekly_batch' };
  }

  return { canDeploy: false, reason: 'Unknown mode: ' + mode, requiresAction: null };
}

/**
 * Generate a human-readable daily/weekly summary of approvals.
 */
function generateDeploymentSummary(approvals) {
  const approved  = approvals.filter(a => a.decision === 'approve');
  const rejected  = approvals.filter(a => a.decision === 'reject');
  const pending   = approvals.filter(a => !a.decision || a.decision === 'pending');
  const escalated = approvals.filter(a => a.decision === 'escalate');
  const lines = [
    '===========================================',
    '  DEPLOYMENT APPROVAL SUMMARY -- ai50m',
    '  Generated: ' + nowISO(),
    '===========================================', '',
    '  Total leads reviewed : ' + approvals.length,
    '  Approved             : ' + approved.length,
    '  Rejected             : ' + rejected.length,
    '  Escalated            : ' + escalated.length,
    '  Pending              : ' + pending.length, '',
    '-- Approved Leads --'
  ];
  for (const a of approved) lines.push('  OK ' + a.leadId + ' | Score: ' + a.score + ' | Tier: ' + a.tier + ' | By: ' + a.decidedBy);
  if (rejected.length > 0) { lines.push('', '-- Rejected Leads --'); for (const a of rejected) lines.push('  NO ' + a.leadId + ' | Score: ' + a.score + ' | Reason: ' + a.decisionReason); }
  if (pending.length > 0)  { lines.push('', '-- Pending Review --');  for (const a of pending)  lines.push('  ?  ' + a.leadId + ' | Score: ' + a.score + ' | Tier: ' + a.tier); }
  lines.push('', '===========================================');
  return lines.join('\n');
}

function getAuditLog() { return [..._auditLog]; }

export { checkDeploymentApproval, createApprovalRequest, recordApproval, checkStagingRequired, generateDeploymentSummary, getAuditLog };
