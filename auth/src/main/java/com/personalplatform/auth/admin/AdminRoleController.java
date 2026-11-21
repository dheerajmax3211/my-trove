package com.personalplatform.auth.admin;

import com.personalplatform.auth.rbac.RbacService;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/roles")
public class AdminRoleController {

    private final RbacService rbac;

    public AdminRoleController(RbacService rbac) {
        this.rbac = rbac;
    }

    /** Every role with its description and permissions. */
    @GetMapping
    @PreAuthorize("hasAuthority('users:read')")
    public List<RbacService.RoleView> roles() {
        return rbac.roles();
    }
}
