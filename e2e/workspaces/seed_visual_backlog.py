"""Run from the backend checkout with the isolated browser runner environment.
Refuses production and persistent preview data directories.
"""
import os,sys
sys.path.insert(0,'api_service')
assert os.environ['JDE_API_DATA_DIR'].startswith('/private/tmp/jade-ux-walkthroughs-')
from jde_api_service.services.registry import get_customer_link_service,get_domain_review_service
from jde_api_service.models.change import UserStory,AcceptanceCriterion
from jde_mcp_server import backlog
rows=[('S-UX-RETURNS','As a returns coordinator, I want a missing carrier flagged before collection, so that returns reach the correct depot.','High','Medium','High'),('S-UX-INVOICE','As a service coordinator, I want invoice references shown on return requests, so that customer queries can be resolved sooner.','Medium','Low','Medium'),('S-UX-CONTACT','As a service agent, I want a preferred contact shown on a return, so that I can reach the right person.','Low','Low','Small')]
for sid,text,complexity,impact,benefit in rows:
 backlog.propose_to_backlog(sid,text+'\n\nbusiness_context: SYNTHETIC UX test fixture',{},complexity,source='Business')
 get_customer_link_service().link(sid,'bwm')
 service=get_domain_review_service()
 service.ensure(sid,UserStory(statement=text,business_context='SYNTHETIC UX test fixture',business_impact_rating=impact,business_benefit_rating=benefit,acceptance_criteria=[AcceptanceCriterion(id='AC1',text='The requested information is visible for the matching return.')]))
 service.assign_domain(sid,business_domain_id='DOM-BWM-CUST-SERVICE',uncertain=False,note='Isolated UX fixture')
print('Three synthetic review stories created in isolated test data.')
