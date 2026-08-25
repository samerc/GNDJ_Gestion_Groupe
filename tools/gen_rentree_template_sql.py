# -*- coding: utf-8 -*-
"""Emit UTF-8 SQL that rebuilds the rentree_task_templates master list (dev DB).
Wipes the table, inserts the reconciled 31-task template, then wires dependencies by title."""

# (order, title, phase, role, fanout, deadline, action, progress, anchor, [dep titles by order index])
CG, CU = "chef-de-groupe", "chef-unite"
T = [
 # ① Configuration
 ("Définir la nouvelle année scoute et les dates","Configuration",CG,False,"4ᵉ sem. septembre","goto-settings",None,None,[]),
 ("Vérifier les unités, types et équipes (créer les nouvelles sizaines)","Configuration",CG,False,"4ᵉ sem. septembre","goto-units",None,None,[]),
 ("Confirmer les maîtrises (CU/ACU de chaque unité)","Configuration",CG,False,"4ᵉ sem. septembre","goto-maitrises",None,None,[]),
 ("Envoyer l'email d'accueil aux chefs","Configuration",CG,False,"4ᵉ sem. septembre","goto-communications",None,None,[2]),
 ("Vérifier les textes des emails","Configuration",CG,False,"4ᵉ sem. septembre","goto-email",None,None,[]),
 ("Mettre à jour les pièces jointes des modèles d'email","Configuration",CG,False,"4ᵉ sem. septembre","goto-email",None,None,[]),
 ("Arranger le document des tenues et le mettre en ligne","Configuration",CG,False,"septembre",None,None,None,[]),
 ("Confirmer les étapes et badges de l'année","Configuration",CG,False,"octobre","goto-progression",None,None,[]),
 # ② Passage
 ("Ouvrir le passage","Passage",CG,False,"1ʳᵉ sem. octobre","open-passage","passage-open",None,[0]),
 ("Définir les quotas d'accueil par unité","Passage",CG,False,"1ʳᵉ sem. octobre","goto-demandes",None,None,[1]),
 ("Proposer les passages de chaque membre (ou « Pas de changement »)","Passage",CU,True,"1ʳᵉ sem. octobre","goto-passage","passage-proposed",None,[8]),
 ("Réviser et approuver les propositions de passage","Passage",CG,False,"2ᵉ sem. octobre","goto-passage-review",None,None,[10]),
 ("Finaliser les passages (création des nouvelles affectations)","Passage",CG,False,"2ᵉ sem. octobre","goto-passage-review","passage-finalized","passage.date",[11]),
 ("Collecter les coordonnées des membres qui quittent au passage","Passage",CU,True,"1ʳᵉ sem. octobre","goto-passage",None,None,[10]),
 # ③ Demandes
 ("Mettre à jour les conditions d'inscription (texte d'acceptation des demandes)","Demandes",CG,False,"septembre","goto-settings",None,None,[0]),
 ("Rédiger la lettre de refus (pièce jointe du modèle « demande refusée »)","Demandes",CG,False,"septembre","goto-email",None,None,[5]),
 ("Ouvrir les inscriptions","Demandes",CG,False,"septembre","open-demandes","demandes-open","demande.submission_start",[0,9,14]),
 ("Réviser les demandes d'inscription (accepter/refuser + unité)","Demandes",CG,False,"octobre","goto-demandes","demandes-reviewed","demande.submission_deadline",[16]),
 ("Relancer les familles qui n'ont pas soumis leur demande","Demandes",CG,False,"octobre","goto-demandes",None,None,[16]),
 ("Envoyer les réponses aux demandes (conversion en membres)","Demandes",CG,False,"octobre","goto-demandes","demandes-sent","demande.member_start_date",[17]),
 # ④ Dossiers membres
 ("Ouvrir la période de réinscription (dépôt des documents)","Dossiers membres",CG,False,"octobre","goto-documents",None,"documents.deposit_start",[12]),
 ("Vérifier les documents — 1ère vérification","Dossiers membres",CU,True,"octobre","goto-documents",None,"documents.deposit_deadline",[20]),
 ("Relancer les familles avec des documents manquants","Dossiers membres",CG,False,"novembre","goto-document-reminders",None,"documents.correction_start",[21]),
 ("Vérifier les documents — 2ème vérification","Dossiers membres",CU,True,"novembre","goto-documents",None,"documents.correction_deadline",[22]),
 ("Bloquer les membres dont les dossiers sont incomplets","Dossiers membres",CG,False,"novembre","goto-documents",None,"documents.final_deadline",[23]),
 ("Suivre et enregistrer les cotisations","Dossiers membres",CU,True,"octobre – novembre","goto-documents","cotisations-paid","documents.deposit_deadline",[12]),
 ("Relancer les accès non activés","Dossiers membres",CG,False,"novembre","goto-send-access",None,None,[19]),
 ("Les chefs mettent à jour les membres (badges, étapes…)","Dossiers membres",CU,True,"novembre","goto-progression",None,None,[12]),
 # ⑤ Organisation
 ("Organiser la séance photo","Organisation",CU,True,"octobre","goto-photo","photos-done",None,[12]),
 ("Répartir les membres en sizaines / équipes","Organisation",CU,True,"octobre","goto-my-unit",None,None,[12]),
 ("Vérifier le trombinoscope / la liste","Organisation",CU,True,"octobre","goto-my-unit",None,None,[29]),
]

def q(s):  # SQL string literal
    return "'" + s.replace("'", "''") + "'"
def qn(s):  # nullable string literal
    return "NULL" if s is None else q(s)

lines = ["SET client_encoding TO 'UTF8';", "BEGIN;",
         "-- Rebuild the rentrée master template (dev). No FK references it, safe to wipe.",
         "DELETE FROM rentree_task_templates;", ""]
for i, (title, phase, role, fan, dl, act, prog, anch, deps) in enumerate(T):
    lines.append(
        "INSERT INTO rentree_task_templates "
        "(id,title,phase,display_order,assignee_type,assignee_role,fan_out_per_unit,assignee_member_ids,"
        "default_deadline_label,action_key,progress_key,deadline_anchor,depends_on_template_ids,"
        "created_at,updated_at,is_deleted) VALUES "
        f"(gen_random_uuid(),{q(title)},{q(phase)},{i},'role',{q(role)},{str(fan).lower()},'{{}}',"
        f"{qn(dl)},{qn(act)},{qn(prog)},{qn(anch)},'{{}}',now(),now(),false);")
lines.append("")
# Wire dependencies by title (unique titles).
for i, (title, *_rest) in enumerate(T):
    deps = T[i][8]
    if not deps:
        continue
    dep_titles = ",".join(q(T[d][0]) for d in deps)
    lines.append(
        f"UPDATE rentree_task_templates SET depends_on_template_ids = "
        f"ARRAY(SELECT id FROM rentree_task_templates WHERE title IN ({dep_titles})) "
        f"WHERE title = {q(title)};")
lines.append("")
lines.append("COMMIT;")

out = r"C:\tmp\rentree_template.sql"
open(out, "w", encoding="utf-8").write("\n".join(lines))
print("Wrote", out, "with", len(T), "tasks")
